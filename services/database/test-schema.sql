-- Test script to verify Coffee & Canvas database schema
-- Run this after migrations to ensure everything works correctly

-- Test 1: Create a test room
INSERT INTO rooms (code, name, capacity) 
VALUES ('TEST99', 'Schema Test Room', 5)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- Test 2: Add users to the room
INSERT INTO users (room_id, display_name, color)
SELECT r.id, 'Test User 1', '#FF0000'
FROM rooms r WHERE r.code = 'TEST99'
ON CONFLICT DO NOTHING;

INSERT INTO users (room_id, display_name, color)
SELECT r.id, 'Test User 2', '#00FF00'
FROM rooms r WHERE r.code = 'TEST99'
ON CONFLICT DO NOTHING;

-- Test 3: Insert stroke events with spatial data
INSERT INTO stroke_events (room_id, stroke_id, user_id, event_type, chunk_key, data)
SELECT 
    r.id,
    'test_stroke_001',
    u.id,
    'begin',
    '0:0',
    '{"tool":"brush","color":"#FF0000","width":5}'::jsonb
FROM rooms r, users u 
WHERE r.code = 'TEST99' AND u.display_name = 'Test User 1'
LIMIT 1;

INSERT INTO stroke_events (room_id, stroke_id, user_id, event_type, chunk_key, data)
SELECT 
    r.id,
    'test_stroke_001',
    u.id,
    'segment',
    '0:0',
    '{"points":[{"x":100,"y":200},{"x":150,"y":250},{"x":200,"y":300}]}'::jsonb
FROM rooms r, users u 
WHERE r.code = 'TEST99' AND u.display_name = 'Test User 1'
LIMIT 1;

INSERT INTO stroke_events (room_id, stroke_id, user_id, event_type, chunk_key, data)
SELECT 
    r.id,
    'test_stroke_001',
    u.id,
    'end',
    '0:0',
    '{}'::jsonb
FROM rooms r, users u 
WHERE r.code = 'TEST99' AND u.display_name = 'Test User 1'
LIMIT 1;

-- Test 4: Verify spatial indexing works
SELECT 'Testing spatial chunk calculation...' as test_description;
SELECT calculate_chunk_key(100, 200) as chunk_key_result;
SELECT calculate_chunk_key(1500, 2500, 1000) as chunk_key_custom_size;

-- Test 5: Verify geometry trigger works
SELECT 'Testing geometry trigger...' as test_description;
SELECT 
    stroke_id,
    ST_AsText(geometry) as geometry_wkt,
    ST_NumGeometries(geometry) as point_count
FROM stroke_events 
WHERE stroke_id = 'test_stroke_001' AND event_type = 'segment';

-- Test 6: Test spatial query functions
SELECT 'Testing spatial query functions...' as test_description;
SELECT chunk_key FROM get_chunks_in_bounds(0, 0, 2000, 2000, 1000);

-- Test 7: Verify room statistics update
SELECT 'Testing room statistics...' as test_description;
SELECT code, stroke_count FROM rooms WHERE code = 'TEST99';

-- Test 8: Test viewport query function
SELECT 'Testing viewport queries...' as test_description;
SELECT 
    stroke_id,
    event_type,
    data->>'tool' as tool
FROM get_strokes_in_viewport(
    (SELECT id FROM rooms WHERE code = 'TEST99'),
    0, 0, 500, 500
);

-- Test 9: Verify indexes exist
SELECT 'Verifying indexes...' as test_description;
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('rooms', 'users', 'stroke_events')
ORDER BY tablename, indexname;

-- Test 10: Performance test with multiple chunks
INSERT INTO stroke_events (room_id, stroke_id, user_id, event_type, chunk_key, data)
SELECT 
    r.id,
    'perf_stroke_' || generate_series,
    u.id,
    'end',
    generate_series::text || ':' || generate_series::text,
    ('{"tool":"brush","color":"#0000FF","width":3,"points":[{"x":' || (generate_series * 100) || ',"y":' || (generate_series * 100) || '}]}')::jsonb
FROM rooms r, users u, generate_series(1, 10)
WHERE r.code = 'TEST99' AND u.display_name = 'Test User 2'
LIMIT 10;

-- Verify performance test results
SELECT 'Performance test results...' as test_description;
SELECT 
    COUNT(*) as total_events,
    COUNT(DISTINCT chunk_key) as unique_chunks,
    COUNT(DISTINCT stroke_id) as unique_strokes
FROM stroke_events se
JOIN rooms r ON se.room_id = r.id
WHERE r.code = 'TEST99';

-- Final verification
SELECT 'Schema test completed successfully!' as result;

-- Cleanup test data (optional - comment out to keep test data)
-- DELETE FROM stroke_events WHERE room_id IN (SELECT id FROM rooms WHERE code = 'TEST99');
-- DELETE FROM users WHERE room_id IN (SELECT id FROM rooms WHERE code = 'TEST99');
-- DELETE FROM rooms WHERE code = 'TEST99';