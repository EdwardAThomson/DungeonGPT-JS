#!/bin/bash

# Test Supabase Backend Locally
# This script helps you test against production Supabase without pushing to GitHub

echo "🧪 Supabase Local Testing Setup"
echo "================================"
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
  echo "⚠️  .env.local not found"
  echo ""
  echo "Create .env.local with:"
  echo "  REACT_APP_CF_PAGES=true"
  echo "  REACT_APP_SUPABASE_URL=https://your-project.supabase.co"
  echo "  REACT_APP_SUPABASE_ANON_KEY=your_key"
  echo ""
  echo "See .env.local.supabase.example for template"
  exit 1
fi

# Check if REACT_APP_CF_PAGES is set
if ! grep -q "REACT_APP_CF_PAGES=true" .env.local; then
  echo "⚠️  .env.local missing REACT_APP_CF_PAGES=true"
  echo "Add this line to route to Supabase in dev"
  exit 1
fi

echo "✓ .env.local configured for Supabase"
echo ""
echo "Starting dev server..."
echo "Watch console for: [heroesApi] Using Supabase backend (production)"
echo ""

npm start
