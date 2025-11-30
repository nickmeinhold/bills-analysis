#!/bin/bash
set -e

echo "🚀 Deploying frontend to Firebase Hosting..."
echo "Project: debt-dashboard-project"
echo ""

# Build the React app
echo "📦 Building React app..."
npm run build

# Deploy to Firebase Hosting
echo "🔥 Deploying to Firebase..."
firebase deploy --only hosting

echo ""
echo "✅ Frontend deployed successfully!"
echo "URL: https://debt-dashboard-project.web.app"
