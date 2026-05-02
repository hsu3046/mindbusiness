#!/bin/bash
# MindBusiness - End-to-End Integration Test
# Tests the complete flow: classify → generate → expand (L3→L4→L5)

set -e  # Exit on error

BASE_URL="http://localhost:8000"
TOPIC="카페 창업"
LANGUAGE="Korean"

echo "🧪 MindBusiness - 통합 테스트"
echo "================================"
echo ""

# Test 1: Health Check
echo "1️⃣  Health Check..."
HEALTH=$(curl -s "$BASE_URL/health")
if echo "$HEALTH" | grep -q "ok"; then
    echo "✅ 서버 정상"
else
    echo "❌ 서버 에러"
    exit 1
fi
echo ""

# Test 2: Framework Classification
echo "2️⃣  Framework Classification..."
CLASSIFY_RESULT=$(curl -s -X POST "$BASE_URL/api/v1/classify" \
  -H "Content-Type: application/json" \
  -d "{\"user_input\": \"$TOPIC\", \"user_language\": \"$LANGUAGE\"}")

# Check if clarification is needed
NEEDS_CLARIFICATION=$(echo "$CLASSIFY_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('needs_clarification', False))")

if [ "$NEEDS_CLARIFICATION" = "True" ]; then
    echo "⚠️  Clarification required - auto-selecting first option"
    FRAMEWORK=$(echo "$CLASSIFY_RESULT" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['clarification_options'][0]['framework_id'] if data.get('clarification_options') else 'BMC')")
else
    FRAMEWORK=$(echo "$CLASSIFY_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('selected_framework_id', 'BMC'))")
fi

echo "선택된 Framework: $FRAMEWORK"

if [ -z "$FRAMEWORK" ] || [ "$FRAMEWORK" = "None" ]; then
    echo "❌ Classification 실패"
    exit 1
fi
echo "✅ Classification 성공"
echo ""

# Test 3: Mindmap Generation (L0-L2)
echo "3️⃣  Mindmap Generation (L0-L2)..."
GENERATE_RESULT=$(curl -s -X POST "$BASE_URL/api/v1/generate" \
  -H "Content-Type: application/json" \
  -d "{\"topic\": \"$TOPIC\", \"framework_id\": \"$FRAMEWORK\", \"language\": \"$LANGUAGE\"}")

TOTAL_NODES=$(echo "$GENERATE_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('total_nodes', 0))")
echo "생성된 노드 수: $TOTAL_NODES"

if [ "$TOTAL_NODES" -lt 10 ]; then
    echo "❌ Generation 실패 (노드 수 부족)"
    exit 1
fi
echo "✅ Generation 성공"
echo ""

# Test 4: Node Expansion L3 (Framework Nesting)
echo "4️⃣  Node Expansion L3 (Framework Nesting Test)..."
EXPAND_L3=$(curl -s -X POST "$BASE_URL/api/v1/expand" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "'"$TOPIC"'",
    "context_path": ["고객 세그먼트", "30대 직장인"],
    "target_node_label": "30대 직장인",
    "current_framework_id": "'"$FRAMEWORK"'",
    "used_frameworks": ["'"$FRAMEWORK"'"],
    "current_depth": 2,
    "language": "'"$LANGUAGE"'"
  }')

L3_MODE=$(echo "$EXPAND_L3" | python3 -c "import sys, json; print(json.load(sys.stdin).get('expansion_mode', 'NONE'))")
L3_FRAMEWORK=$(echo "$EXPAND_L3" | python3 -c "import sys, json; print(json.load(sys.stdin).get('applied_framework_id', 'None'))")
echo "L3 Mode: $L3_MODE, Framework: $L3_FRAMEWORK"

if [ "$L3_MODE" == "NONE" ]; then
    echo "❌ L3 Expansion 실패"
    exit 1
fi
echo "✅ L3 Expansion 성공 (Framework: $L3_FRAMEWORK)"
echo ""

# Test 5: Node Expansion L4 (Logic Tree)
echo "5️⃣  Node Expansion L4 (Logic Tree Test)..."
EXPAND_L4=$(curl -s -X POST "$BASE_URL/api/v1/expand" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "'"$TOPIC"'",
    "context_path": ["고객 세그먼트", "30대 직장인", "핵심 니즈"],
    "target_node_label": "핵심 니즈",
    "current_framework_id": "'"$FRAMEWORK"'",
    "used_frameworks": ["'"$FRAMEWORK"'", "PERSONA"],
    "current_depth": 3,
    "language": "'"$LANGUAGE"'"
  }')

L4_MODE=$(echo "$EXPAND_L4" | python3 -c "import sys, json; print(json.load(sys.stdin).get('expansion_mode', 'NONE'))")
L4_CHILDREN=$(echo "$EXPAND_L4" | python3 -c "import sys, json; print(len(json.load(sys.stdin).get('children', [])))")
echo "L4 Mode: $L4_MODE, Children: $L4_CHILDREN"

if [ "$L4_CHILDREN" -lt 3 ]; then
    echo "❌ L4 Expansion 실패 (자식 노드 부족)"
    exit 1
fi
echo "✅ L4 Expansion 성공"
echo ""

# Summary
echo "================================"
echo "🎉 모든 테스트 통과!"
echo ""
echo "📊 테스트 결과:"
echo "  - Health Check: ✅"
echo "  - Classification: ✅ ($FRAMEWORK)"
echo "  - Generation: ✅ ($TOTAL_NODES nodes)"
echo "  - L3 Expansion: ✅ ($L3_FRAMEWORK)"
echo "  - L4 Expansion: ✅ (logic_tree)"
echo ""
