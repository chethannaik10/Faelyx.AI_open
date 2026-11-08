#!/bin/bash
# Verifies every new backend operation added this round: Revolve, Fillet,
# Chamfer, Shell, Mirror Body, Linear Pattern, Circular Pattern, Scale, and
# the new /inspect_part metrics endpoint (Mass Properties / Model
# Validation / Interference Check). Same pattern as run_test.command:
# restart the real server, hit it with real requests, check real results
# — nothing here is a mock.
cd "$(dirname "$0")/.."
source ./activate_venv.sh
pkill -f "uvicorn cad_server:app" 2>/dev/null
sleep 1
nohup uvicorn cad_server:app --port 8000 > server_log.txt 2>&1 &
sleep 4

OUT="tests/new_ops_test_results.txt"
echo "=== New CAD ops test run: $(date) ===" > "$OUT"

health=$(curl -s http://127.0.0.1:8000/health)
echo "health: $health" >> "$OUT"

run_stl_test () {
  name="$1"; json="$2"
  status=$(curl -s -X POST http://127.0.0.1:8000/build_part -H "Content-Type: application/json" \
    --data @"tests/$json" -o "tests/${name}_result.stl" -w "%{http_code}")
  size=$(wc -c < "tests/${name}_result.stl" | tr -d ' ')
  echo "[$name] HTTP_STATUS=$status  stl_bytes=$size" >> "$OUT"
}

run_json_test () {
  name="$1"; json="$2"
  status=$(curl -s -X POST http://127.0.0.1:8000/inspect_part -H "Content-Type: application/json" \
    --data @"tests/$json" -o "tests/${name}_result.json" -w "%{http_code}")
  echo "[$name] HTTP_STATUS=$status  body=$(cat tests/${name}_result.json)" >> "$OUT"
}

run_stl_test "revolve" "test_revolve.json"
run_stl_test "fillet" "test_fillet.json"
run_stl_test "chamfer" "test_chamfer.json"
run_stl_test "shell" "test_shell.json"
run_stl_test "mirror_body" "test_mirror_body.json"
run_stl_test "linear_pattern" "test_linear_pattern.json"
run_stl_test "circular_pattern" "test_circular_pattern.json"
run_stl_test "scale" "test_scale.json"
run_json_test "inspect" "test_inspect.json"

echo "" >> "$OUT"
echo "DONE_MARKER" >> "$OUT"
cat "$OUT"
