#!/bin/bash

# Configuration
API_URL="http://localhost:3000/api/v1/orders"
API_KEY="$1"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

if [ -z "$API_KEY" ]; then
    echo -e "${RED}Error: API Key is required.${NC}"
    echo "Usage: ./test_api_order.sh <YOUR_API_KEY>"
    exit 1
fi

echo -e "🚀 Testing Kontigo API Injection with Key: ${GREEN}${API_KEY:0:10}••••${NC}"
echo "Target: $API_URL"

# Mock Payload (UberEats style simplified)
PAYLOAD='{
  "source": "UberEats",
  "tableId": 9999,
  "subtotal": 15000,
  "tip": 1500,
  "total": 16500,
  "items": [
    {
      "product": { "id": 1, "name": "Hamburguesa Doble (API)", "price": 9000 },
      "quantity": 1,
      "notes": "Sin pepinillos"
    },
    {
      "product": { "id": 2, "name": "Papas Fritas (API)", "price": 6000 },
      "quantity": 1
    }
  ]
}'

echo "Sending Payload..."

# Execute Request
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d "$PAYLOAD")

# Parse Response
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE")

if [ "$HTTP_CODE" -eq 201 ]; then
    echo -e "${GREEN}✅ Success! Order Injected.${NC}"
    echo "Response: $BODY"
    echo ""
    echo "👉 Now check your KDS / Orders screen. You should see a new order."
else
    echo -e "${RED}❌ Failed. HTTP Code: $HTTP_CODE${NC}"
    echo "Response: $BODY"
fi
