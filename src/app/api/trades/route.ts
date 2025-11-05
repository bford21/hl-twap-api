import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Force dynamic rendering - API routes should not be pre-rendered
export const dynamic = 'force-dynamic';

// GET /api/trades - Retrieve trade data
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const coin = searchParams.get('coin');
    const side = searchParams.get('side');
    const requestedLimit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 100); // Max 100
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const user = searchParams.get('user');
    const twapId = searchParams.get('twap_id');
    const startTime = searchParams.get('start_time');
    const endTime = searchParams.get('end_time');
    const includeParticipants = searchParams.get('include_participants') !== 'false';

    // If filtering by user or twap_id, we need to start with participants
    if (user || twapId) {
      // Step 1: Find matching participants
      let participantQuery = supabase
        .from('trade_participants')
        .select('trade_id, *');

      if (user) {
        participantQuery = participantQuery.eq('user_address', user.toLowerCase());
      }

      if (twapId) {
        participantQuery = participantQuery.eq('twap_id', parseInt(twapId));
      }

      const { data: participants, error: partError } = await participantQuery;

      if (partError) {
        return NextResponse.json(
          { error: partError.message },
          { status: 500 }
        );
      }

      if (!participants || participants.length === 0) {
        return NextResponse.json({
          data: [],
          count: 0,
          limit: requestedLimit,
          offset,
        });
      }

      // Step 2: Get unique trade IDs
      const tradeIds = Array.from(new Set(participants.map(p => p.trade_id)));

      // Step 3: Fetch the actual trades with filters
      let tradeQuery = supabase
        .from('trades')
        .select('*')
        .in('id', tradeIds)
        .order('time', { ascending: false });

      if (coin) {
        tradeQuery = tradeQuery.eq('coin', coin.toUpperCase());
      }

      if (side && (side === 'A' || side === 'B')) {
        tradeQuery = tradeQuery.eq('side', side);
      }

      if (startTime) {
        tradeQuery = tradeQuery.gte('time', startTime);
      }

      if (endTime) {
        tradeQuery = tradeQuery.lte('time', endTime);
      }

      const { data: allTrades, error: tradeError } = await tradeQuery;

      if (tradeError) {
        return NextResponse.json(
          { error: tradeError.message },
          { status: 500 }
        );
      }

      if (!allTrades || allTrades.length === 0) {
        return NextResponse.json({
          data: [],
          count: 0,
          limit: requestedLimit,
          offset,
        });
      }

      // Apply pagination manually after filtering
      const paginatedTrades = allTrades.slice(offset, offset + requestedLimit);

      // Attach participants if requested
      if (includeParticipants) {
        const paginatedTradeIds = paginatedTrades.map(t => t.id);
        const relevantParticipants = participants.filter(p => 
          paginatedTradeIds.includes(p.trade_id)
        );

        const participantsByTrade = new Map<number, any[]>();
        relevantParticipants.forEach(p => {
          if (!participantsByTrade.has(p.trade_id)) {
            participantsByTrade.set(p.trade_id, []);
          }
          participantsByTrade.get(p.trade_id)!.push(p);
        });

        const tradesWithParticipants = paginatedTrades.map(trade => ({
          ...trade,
          participants: participantsByTrade.get(trade.id) || [],
        }));

        return NextResponse.json({
          data: tradesWithParticipants,
          count: allTrades.length,
          limit: requestedLimit,
          offset,
        });
      }

      return NextResponse.json({
        data: paginatedTrades,
        count: allTrades.length,
        limit: requestedLimit,
        offset,
      });
    }

    // Standard query with max 1000 limit
    let query = supabase
      .from('trades')
      .select('*', { count: 'exact' })
      .order('time', { ascending: false })
      .range(offset, offset + requestedLimit - 1);

    if (coin) query = query.eq('coin', coin.toUpperCase());
    if (side && (side === 'A' || side === 'B')) query = query.eq('side', side);
    if (startTime) query = query.gte('time', startTime);
    if (endTime) query = query.lte('time', endTime);

    const { data: trades, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!trades || trades.length === 0) {
      return NextResponse.json({
        data: [],
        count: 0,
        limit: requestedLimit,
        offset,
      });
    }

    // If include_participants is true, fetch them
    if (includeParticipants) {
      const tradeIds = trades.map(t => t.id);
      
      const { data: participants, error: partError } = await supabase
        .from('trade_participants')
        .select('*')
        .in('trade_id', tradeIds);

      if (!partError && participants) {
        const participantsByTrade = new Map<number, any[]>();
        participants.forEach(p => {
          if (!participantsByTrade.has(p.trade_id)) {
            participantsByTrade.set(p.trade_id, []);
          }
          participantsByTrade.get(p.trade_id)!.push(p);
        });

        const tradesWithParticipants = trades.map(trade => ({
          ...trade,
          participants: participantsByTrade.get(trade.id) || [],
        }));

        return NextResponse.json({
          data: tradesWithParticipants,
          count: count || 0,
          limit: requestedLimit,
          offset,
        });
      }
    }

    return NextResponse.json({
      data: trades,
      count: count || 0,
      limit: requestedLimit,
      offset,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/trades - Insert new trade data
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { coin, side, time, px, sz, hash, trade_dir_override, participants } = body;

    // Validate required fields
    if (!coin || !side || !time || px === undefined || sz === undefined || !hash || !participants) {
      return NextResponse.json(
        { 
          error: 'Missing required fields: coin, side, time, px, sz, hash, participants',
          received: Object.keys(body),
        },
        { status: 400 }
      );
    }

    // Validate side value
    if (side !== 'A' && side !== 'B') {
      return NextResponse.json(
        { error: 'side must be either "A" or "B"' },
        { status: 400 }
      );
    }

    // Validate participants is an array
    if (!Array.isArray(participants) || participants.length === 0) {
      return NextResponse.json(
        { error: 'participants must be a non-empty array' },
        { status: 400 }
      );
    }

    // Insert trade first
    const { data: tradeData, error: tradeError } = await supabase
      .from('trades')
      .insert([
        {
          coin,
          side,
          time,
          px: typeof px === 'string' ? parseFloat(px) : px,
          sz: typeof sz === 'string' ? parseFloat(sz) : sz,
          hash,
          trade_dir_override: trade_dir_override || null,
        },
      ])
      .select()
      .single();

    if (tradeError || !tradeData) {
      return NextResponse.json(
        { error: tradeError?.message || 'Failed to insert trade' },
        { status: 500 }
      );
    }

    // Insert participants
    const participantRecords = participants.map((p: any) => ({
      trade_id: tradeData.id,
      user_address: p.user_address || p.user,
      start_pos: typeof p.start_pos === 'string' ? parseFloat(p.start_pos) : p.start_pos,
      oid: p.oid,
      twap_id: p.twap_id || null,
      cloid: p.cloid || null,
    }));

    const { data: participantData, error: participantError } = await supabase
      .from('trade_participants')
      .insert(participantRecords)
      .select();

    if (participantError) {
      // Rollback trade if participants fail
      await supabase.from('trades').delete().eq('id', tradeData.id);
      return NextResponse.json(
        { error: participantError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        ...tradeData,
        participants: participantData,
      },
      message: 'Trade and participants inserted successfully',
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

