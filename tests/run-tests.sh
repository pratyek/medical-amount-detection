#!/bin/bash

# Medical Amount Detection API - Test Runner
# Runs all unit tests with coverage

echo "🧪 Medical Amount Detection API - Test Suite"
echo "============================================="
echo ""

# Set test environment
export NODE_ENV=test

# Run tests with coverage
echo "📊 Running unit tests with coverage..."
npm run test:coverage

echo ""
echo "📋 Test Summary:"
echo "- Unit tests for all services"
echo "- Integration tests for API endpoints"
echo "- Mocked external dependencies"
echo "- Coverage report generated in coverage/ directory"
echo ""

# Check if tests passed
if [ $? -eq 0 ]; then
    echo "✅ All tests passed!"
    echo "📊 Coverage report available in coverage/index.html"
else
    echo "❌ Some tests failed. Check the output above."
    exit 1
fi
