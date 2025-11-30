#!/bin/bash
set -e

# Configuration
PROJECT_ID="debt-dashboard-project"
SERVICE_NAME="debt-dashboard-backend"
REGION="asia-northeast3"  # km region

echo "🚀 Deploying backend to Cloud Run..."
echo "Project: $PROJECT_ID"
echo "Service: $SERVICE_NAME"
echo "Region: $REGION"
echo ""

# Build and deploy using Cloud Build (no local Docker build needed)
gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --project $PROJECT_ID \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --timeout 300s \
  --set-env-vars "NODE_ENV=production" \
  --min-instances 0 \
  --max-instances 10

echo ""
echo "✅ Backend deployed successfully!"
echo "URL: https://$SERVICE_NAME-$(echo $REGION | tr '-' '').a.run.app"
