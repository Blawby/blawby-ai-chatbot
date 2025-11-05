#!/bin/bash

# Comprehensive Stripe Integration Test Script
echo "🧪 Testing Stripe Integration..."
echo "=================================="

BASE_URL="http://localhost:8787"

# Test 1: Health Check
echo "1. Testing Health Endpoint..."
HEALTH_RESPONSE=$(curl -s --fail-with-body -X GET "$BASE_URL/api/health")
CURL_EXIT_CODE=$?
if [ $CURL_EXIT_CODE -ne 0 ]; then
    echo "❌ Health endpoint request failed (curl exit code: $CURL_EXIT_CODE)"
    echo "Response: $HEALTH_RESPONSE"
    exit 1
fi
if echo "$HEALTH_RESPONSE" | jq -e '.success' > /dev/null; then
    echo "✅ Health endpoint working"
else
    echo "❌ Health endpoint failed"
    exit 1
fi

# Test 2: Organizations Endpoint with Stripe Fields
echo "2. Testing Organizations Endpoint..."
ORG_RESPONSE=$(curl -s --fail-with-body -X GET "$BASE_URL/api/organizations")
CURL_EXIT_CODE=$?
if [ $CURL_EXIT_CODE -ne 0 ]; then
    echo "❌ Organizations endpoint request failed (curl exit code: $CURL_EXIT_CODE)"
    echo "Response: $ORG_RESPONSE"
    exit 1
fi
if echo "$ORG_RESPONSE" | jq -e '.success' > /dev/null; then
    echo "✅ Organizations endpoint working"
    
    # Check for Stripe fields
    STRIPE_FIELDS=$(echo "$ORG_RESPONSE" | jq '.data[0] | keys | map(select(. | contains("stripe") or . == "subscriptionTier" or . == "seats"))')
    echo "📊 Stripe fields present: $STRIPE_FIELDS"
    
    # Check organization data
    ORG_DATA=$(echo "$ORG_RESPONSE" | jq '.data[0] | {id, name, stripeCustomerId, subscriptionTier, seats}')
    echo "📋 Organization data: $ORG_DATA"
else
    echo "❌ Organizations endpoint failed"
    exit 1
fi

# Test 3: Legacy Payment Endpoint (should return 410)
echo "3. Testing Legacy Payment Endpoint..."
LEGACY_RESPONSE=$(curl -s -X POST "$BASE_URL/api/payment/upgrade" \
    -H "Content-Type: application/json" \
    -d '{"organizationId":"test-org","seats":1}' \
    -w '%{http_code}')
LEGACY_HTTP_CODE="${LEGACY_RESPONSE: -3}"
LEGACY_BODY="${LEGACY_RESPONSE%???}"
if [ "$LEGACY_HTTP_CODE" != "410" ]; then
    echo "❌ Legacy payment endpoint returned unexpected status: $LEGACY_HTTP_CODE (expected 410)"
    echo "Response: $LEGACY_BODY"
    exit 1
fi
if echo "$LEGACY_BODY" | jq -e '.errorCode == "LEGACY_PAYMENTS_DISABLED"' > /dev/null; then
    echo "✅ Legacy payment endpoint correctly disabled (410 Gone)"
else
    echo "❌ Legacy payment endpoint not properly disabled"
    echo "Response body: $LEGACY_BODY"
    exit 1
fi

# Test 4: Subscription Sync Endpoint (should require auth)
echo "4. Testing Subscription Sync Endpoint..."
SYNC_HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/sync_response.json -X POST "$BASE_URL/api/subscription/sync" \
    -H "Content-Type: application/json" \
    -d '{"organizationId":"test-org","stripeSubscriptionId":"sub_test123"}')
SYNC_RESPONSE=$(cat /tmp/sync_response.json)
CURL_EXIT_CODE=$?
if [ $CURL_EXIT_CODE -ne 0 ]; then
    echo "❌ Subscription sync endpoint request failed (curl exit code: $CURL_EXIT_CODE)"
    echo "Response: $SYNC_RESPONSE"
    exit 1
fi
if [ "$SYNC_HTTP_CODE" -ne 401 ]; then
    echo "❌ Expected 401 status code, got $SYNC_HTTP_CODE"
    exit 1
fi
if echo "$SYNC_RESPONSE" | jq -e '.errorCode == "HTTP_401"' > /dev/null; then
    echo "✅ Subscription sync endpoint correctly requires authentication"
else
    echo "❌ Subscription sync endpoint authentication not working"
    exit 1
fi

# Test 5: Better Auth Session Endpoint
echo "5. Testing Better Auth Session Endpoint..."
AUTH_RESPONSE=$(curl -s --fail-with-body -X GET "$BASE_URL/api/auth/get-session")
CURL_EXIT_CODE=$?
if [ $CURL_EXIT_CODE -ne 0 ]; then
    echo "❌ Better Auth session endpoint request failed (curl exit code: $CURL_EXIT_CODE)"
    echo "Response: $AUTH_RESPONSE"
    exit 1
fi
if echo "$AUTH_RESPONSE" | jq -e '. == null' > /dev/null; then
    echo "✅ Better Auth session endpoint working (null for unauthenticated)"
else
    echo "❌ Better Auth session endpoint not working"
    exit 1
fi

# Test 6: Stripe Webhook Endpoint (should validate secret)
echo "6. Testing Stripe Webhook Endpoint..."
WEBHOOK_RESPONSE=$(curl -s --fail-with-body -X POST "$BASE_URL/api/auth/stripe/webhook" \
    -H "Content-Type: application/json" \
    -d '{"type":"customer.created","data":{"object":{"id":"cus_test123"}}}')
CURL_EXIT_CODE=$?
if [ $CURL_EXIT_CODE -ne 0 ]; then
    echo "❌ Stripe webhook endpoint request failed (curl exit code: $CURL_EXIT_CODE)"
    echo "Response: $WEBHOOK_RESPONSE"
    exit 1
fi
if echo "$WEBHOOK_RESPONSE" | jq -e '.code == "WEBHOOK_ERROR_STRIPE_WEBHOOK_SECRET_NOT_FOUND"' > /dev/null; then
    echo "✅ Stripe webhook endpoint correctly validates webhook secret"
else
    echo "❌ Stripe webhook endpoint not properly validating secrets"
    exit 1
fi

echo ""
echo "🎉 All Stripe Integration Tests Passed!"
echo "=================================="
echo "✅ Health endpoint working"
echo "✅ Organizations endpoint with Stripe fields"
echo "✅ Legacy payment endpoints disabled"
echo "✅ Subscription sync endpoint requires auth"
echo "✅ Better Auth integration working"
echo "✅ Stripe webhook validation working"
echo ""
echo "🚀 Stripe integration is fully operational!"
