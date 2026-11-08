#!/bin/bash
cd "$(dirname "$0")"
source ./activate_venv.sh
pkill -f "uvicorn cad_server:app" 2>/dev/null
sleep 1
nohup uvicorn cad_server:app --port 8000 > server_log.txt 2>&1 &
sleep 4
curl -s http://127.0.0.1:8000/health > health_check.txt 2>&1
curl -s -X POST http://127.0.0.1:8000/build_part -H "Content-Type: application/json" --data @test_build_part.json -o test_build_part_result.stl -w "HTTP_STATUS:%{http_code}\n" > build_part_test_result.txt 2>&1
ls -la test_build_part_result.stl >> build_part_test_result.txt
head -c 300 test_build_part_result.stl >> build_part_test_result.txt 2>&1 || true
echo "" >> build_part_test_result.txt
echo "DONE_MARKER" >> build_part_test_result.txt
