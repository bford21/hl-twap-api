import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Force dynamic rendering - API routes should not be pre-rendered
export const dynamic = 'force-dynamic';

// GET /api/twap/[id] - Get all trades for a specific TWAP ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const twapId = parseInt(params.id);
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 100); // Max 100
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (isNaN(twapId)) {
      return NextResponse.json(
        { error: 'Invalid TWAP ID' },
        { status: 400 }
      );
    }

    // Get total count of participants for this TWAP (for statistics later)
    const { count: totalParticipants } = await supabase
      .from('trade_participants')
      .select('*', { count: 'exact', head: true })
      .eq('twap_id', twapId);

    if (!totalParticipants || totalParticipants === 0) {
      return NextResponse.json({
        twap_id: twapId,
        trades: [],
        count: 0,
        limit,
        offset,
        statistics: null,
      });
    }

    // Get only the participants we need for the paginated trades (limit + offset)
    // Fetch more participants than limit to ensure we have enough unique trade_ids
    const { data: participants, error: partError } = await supabase
      .from('trade_participants')
      .select('*')
      .eq('twap_id', twapId)
      .order('created_at', { ascending: false })
      .limit(Math.min((limit + offset) * 2, 1000)); // Fetch up to 2x what we need, max 1000

    if (partError) {
      return NextResponse.json(
        { error: partError.message },
        { status: 500 }
      );
    }

    if (!participants || participants.length === 0) {
      return NextResponse.json({
        twap_id: twapId,
        trades: [],
        count: 0,
        limit,
        offset,
        statistics: null,
      });
    }

    // Get unique trade IDs from the limited participants
    const tradeIds = Array.from(new Set(participants.map(p => p.trade_id)));

    // Get the trades with pagination
    const { data: trades, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .in('id', tradeIds)
      .order('time', { ascending: false })
      .range(offset, offset + limit - 1);

    if (tradesError) {
      return NextResponse.json(
        { error: tradesError.message },
        { status: 500 }
      );
    }

    // Attach participants to each trade
    const participantsByTrade = new Map<number, any[]>();
    participants.forEach(p => {
      if (!participantsByTrade.has(p.trade_id)) {
        participantsByTrade.set(p.trade_id, []);
      }
      participantsByTrade.get(p.trade_id)!.push(p);
    });

    const tradesWithParticipants = trades?.map(trade => ({
      ...trade,
      participants: participantsByTrade.get(trade.id) || [],
    })) || [];

    // Calculate statistics
    const stats = calculateTwapStatistics(tradesWithParticipants, participants);

    return NextResponse.json({
      twap_id: twapId,
      trades: tradesWithParticipants,
      count: tradeIds.length, // Count of unique trades (approximate due to pagination)
      total_participants: totalParticipants, // Total participants count
      limit,
      offset,
      statistics: stats,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function calculateTwapStatistics(trades: any[], participants: any[]) {
  if (trades.length === 0) return null;

  const coins = new Set(trades.map(t => t.coin));
  const totalVolume = trades.reduce((sum, t) => sum + parseFloat(t.sz), 0);
  const totalValue = trades.reduce((sum, t) => sum + (parseFloat(t.sz) * parseFloat(t.px)), 0);
  const prices = trades.map(t => parseFloat(t.px));
  const times = trades.map(t => new Date(t.time).getTime());

  // Get the user address(es) associated with this TWAP
  const users = Array.from(new Set(participants.map(p => p.user_address)));

  return {
    user_addresses: users,
    trade_count: trades.length,
    unique_coins: coins.size,
    coins: Array.from(coins),
    total_volume: totalVolume,
    total_value: totalValue,
    avg_price: prices.reduce((a, b) => a + b, 0) / prices.length,
    min_price: Math.min(...prices),
    max_price: Math.max(...prices),
    first_trade_time: new Date(Math.min(...times)).toISOString(),
    last_trade_time: new Date(Math.max(...times)).toISOString(),
    duration_seconds: (Math.max(...times) - Math.min(...times)) / 1000,
  };
}

