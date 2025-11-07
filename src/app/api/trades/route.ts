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
      // Step 1: Get count of matching participants first (for accurate totals)
      let countQuery = supabase
        .from('trade_participants')
        .select('trade_id', { count: 'exact', head: true });

      if (user) {
        countQuery = countQuery.eq('user_address', user.toLowerCase());
      }

      if (twapId) {
        countQuery = countQuery.eq('twap_id', parseInt(twapId));
      }

      const { count: totalParticipants, error: countError } = await countQuery;

      if (countError) {
        return NextResponse.json(
          { error: countError.message },
          { status: 500 }
        );
      }

      if (!totalParticipants || totalParticipants === 0) {
        return NextResponse.json({
          data: [],
          count: 0,
          limit: requestedLimit,
          offset,
        });
      }

      // Step 2: Fetch ALL participants in batches to get complete trade IDs
      const participants = [];
      const batchSize = 5000;
      let batchOffset = 0;

      while (batchOffset < totalParticipants) {
        let participantQuery = supabase
          .from('trade_participants')
          .select('trade_id, *')
          .range(batchOffset, batchOffset + batchSize - 1);

        if (user) {
          participantQuery = participantQuery.eq('user_address', user.toLowerCase());
        }

        if (twapId) {
          participantQuery = participantQuery.eq('twap_id', parseInt(twapId));
        }

        // Filter by participant side (side is now on participants table)
        if (side && (side === 'A' || side === 'B')) {
          participantQuery = participantQuery.eq('side', side);
        }

        const { data: batch, error: partError } = await participantQuery;

        if (partError) {
          return NextResponse.json(
            { error: partError.message },
            { status: 500 }
          );
        }

        if (batch && batch.length > 0) {
          participants.push(...batch);
        }

        batchOffset += batchSize;

        // Break if we got fewer results than expected
        if (!batch || batch.length < batchSize) {
          break;
        }
      }

      // Step 3: Get unique trade IDs
      const tradeIds = Array.from(new Set(participants.map(p => p.trade_id)));

      // Step 4: Fetch the actual trades with filters (limit batch size for .in() filter)
      const allTrades = [];
      const tradeBatchSize = 1000; // Keep at 1000 for .in() queries to avoid "Bad Request"
      
      for (let i = 0; i < tradeIds.length; i += tradeBatchSize) {
        const batchIds = tradeIds.slice(i, i + tradeBatchSize);
        
        let tradeQuery = supabase
          .from('trades')
          .select('*')
          .in('id', batchIds)
          .order('time', { ascending: false });

        if (coin) {
          tradeQuery = tradeQuery.eq('coin', coin.toUpperCase());
        }

        // Note: side filtering is done at participant level (above)
        // since side is now on trade_participants table, not trades table

        if (startTime) {
          tradeQuery = tradeQuery.gte('time', startTime);
        }

        if (endTime) {
          tradeQuery = tradeQuery.lte('time', endTime);
        }

        const { data: tradeBatch, error: tradeError } = await tradeQuery;

        if (tradeError) {
          return NextResponse.json(
            { error: tradeError.message },
            { status: 500 }
          );
        }

        if (tradeBatch && tradeBatch.length > 0) {
          allTrades.push(...tradeBatch);
        }
      }

      if (!allTrades || allTrades.length === 0) {
        return NextResponse.json({
          data: [],
          count: 0,
          limit: requestedLimit,
          offset,
        });
      }

      // Sort all trades by time descending (since batches might not be in order)
      allTrades.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

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
    // Note: If filtering by side, we need a different approach since side is on participants table
    if (side && (side === 'A' || side === 'B')) {
      // Get trades that have a participant with the specified side
      const { data: participantsWithSide, error: partError } = await supabase
        .from('trade_participants')
        .select('trade_id')
        .eq('side', side)
        .limit(10000); // Get a large batch

      if (partError) {
        return NextResponse.json({ error: partError.message }, { status: 500 });
      }

      const tradeIdsWithSide = Array.from(new Set(participantsWithSide?.map(p => p.trade_id) || []));
      
      let query = supabase
        .from('trades')
        .select('*', { count: 'exact' })
        .in('id', tradeIdsWithSide)
        .order('time', { ascending: false })
        .range(offset, offset + requestedLimit - 1);

      if (coin) query = query.eq('coin', coin.toUpperCase());
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

      // Attach participants if requested
      if (includeParticipants) {
        const tradeIds = trades.map(t => t.id);
        const { data: participants } = await supabase
          .from('trade_participants')
          .select('*')
          .in('trade_id', tradeIds);

        const participantMap = new Map<number, any[]>();
        participants?.forEach(p => {
          if (!participantMap.has(p.trade_id)) {
            participantMap.set(p.trade_id, []);
          }
          participantMap.get(p.trade_id)!.push(p);
        });

        trades.forEach(trade => {
          (trade as any).participants = participantMap.get(trade.id) || [];
        });
      }

      return NextResponse.json({
        data: trades,
        count: count || 0,
        limit: requestedLimit,
        offset,
      });
    }

    // No side filter - standard query
    let query = supabase
      .from('trades')
      .select('*', { count: 'exact' })
      .order('time', { ascending: false })
      .range(offset, offset + requestedLimit - 1);

    if (coin) query = query.eq('coin', coin.toUpperCase());
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

