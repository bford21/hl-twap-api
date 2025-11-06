import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// GET /api/trades/summary - Get unique TWAP summaries for a user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const user = searchParams.get('user');

    if (!user) {
      return NextResponse.json(
        { error: 'User address is required' },
        { status: 400 }
      );
    }

    // Get count of all participants first (for accurate totals)
    const { count: totalParticipantsCount, error: countError } = await supabase
      .from('trade_participants')
      .select('trade_id', { count: 'exact', head: true })
      .eq('user_address', user.toLowerCase())
      .not('twap_id', 'is', null);

    if (countError) {
      return NextResponse.json(
        { error: countError.message },
        { status: 500 }
      );
    }

    if (!totalParticipantsCount || totalParticipantsCount === 0) {
      return NextResponse.json({
        data: [],
        count: 0,
        stats: {
          unique_twaps: 0,
          total_trades: 0,
          total_volume: 0,
        },
      });
    }

    // Fetch all participants in batches of 1000 (Supabase limit)
    console.log(`Fetching ${totalParticipantsCount} participant records for user ${user}...`);
    const participants = [];
    const batchSize = 1000;
    let offset = 0;

    while (offset < totalParticipantsCount) {
      const { data: batch, error: partError } = await supabase
        .from('trade_participants')
        .select('twap_id, user_address, trade_id')
        .eq('user_address', user.toLowerCase())
        .not('twap_id', 'is', null)
        .range(offset, offset + batchSize - 1);

      if (partError) {
        return NextResponse.json(
          { error: partError.message },
          { status: 500 }
        );
      }

      if (batch && batch.length > 0) {
        participants.push(...batch);
        console.log(`Fetched batch ${Math.floor(offset / batchSize) + 1}: ${batch.length} records (total so far: ${participants.length})`);
      }

      offset += batchSize;

      // Break if we got fewer results than expected (reached the end)
      if (!batch || batch.length < batchSize) {
        break;
      }
    }

    console.log(`Total participants fetched: ${participants.length}`);

    // Get unique trade IDs
    const tradeIds = Array.from(new Set(participants.map(p => p.trade_id)));
    console.log(`Found ${tradeIds.length} unique trade IDs`);

    // Fetch trades in batches if there are more than 1000
    const trades = [];
    const tradeBatchSize = 1000;
    
    for (let i = 0; i < tradeIds.length; i += tradeBatchSize) {
      const batchIds = tradeIds.slice(i, i + tradeBatchSize);
      
      const { data: tradeBatch, error: tradeError } = await supabase
        .from('trades')
        .select('id, coin, side, px, sz')
        .in('id', batchIds);

      if (tradeError) {
        return NextResponse.json(
          { error: tradeError.message },
          { status: 500 }
        );
      }

      if (tradeBatch && tradeBatch.length > 0) {
        trades.push(...tradeBatch);
        console.log(`Fetched trade batch ${Math.floor(i / tradeBatchSize) + 1}: ${tradeBatch.length} trades (total so far: ${trades.length})`);
      }
    }

    console.log(`Total trades fetched: ${trades.length}`);

    // Create a map of trade_id to trade info
    const tradeMap = new Map(trades.map(t => [t.id, t]));

    // Group by TWAP ID and aggregate data
    const twapSummaries = new Map<number, {
      twap_id: number;
      address: string;
      coins: Set<string>;
      sides: Set<string>;
      trade_count: number;
      total_volume: number;
      total_price: number;
      price_count: number;
    }>();

    // Calculate total volume (across all TWAPs)
    let totalVolume = 0;

    participants.forEach(p => {
      const trade = tradeMap.get(p.trade_id);
      if (!trade || !p.twap_id) return;

      if (!twapSummaries.has(p.twap_id)) {
        twapSummaries.set(p.twap_id, {
          twap_id: p.twap_id,
          address: p.user_address,
          coins: new Set(),
          sides: new Set(),
          trade_count: 0,
          total_volume: 0,
          total_price: 0,
          price_count: 0,
        });
      }

      const summary = twapSummaries.get(p.twap_id)!;
      summary.coins.add(trade.coin);
      summary.sides.add(trade.side);
      summary.trade_count++;

      // Calculate volume for this trade (price * size)
      const tradeVolume = Number(trade.px) * Number(trade.sz);
      summary.total_volume += tradeVolume;
      totalVolume += tradeVolume;

      // Accumulate price for average calculation
      summary.total_price += Number(trade.px);
      summary.price_count++;
    });

    // Convert to array and format
    const result = Array.from(twapSummaries.values()).map(s => ({
      twap_id: s.twap_id,
      address: s.address,
      coin: Array.from(s.coins).join(', '),
      side: Array.from(s.sides).map(side => side === 'A' ? 'Sell' : 'Buy').join(', '),
      trade_count: s.trade_count,
      total_volume: s.total_volume,
      avg_price: s.price_count > 0 ? s.total_price / s.price_count : 0,
    }))
    .sort((a, b) => b.twap_id - a.twap_id); // Sort by TWAP ID descending

    // Calculate stats
    const uniqueTwaps = twapSummaries.size;
    const totalTrades = tradeIds.length;

    return NextResponse.json({
      data: result,
      count: result.length,
      stats: {
        unique_twaps: uniqueTwaps,
        total_trades: totalTrades,
        total_volume: totalVolume,
      },
    });

  } catch (error: any) {
    console.error('Error fetching TWAP summaries:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

