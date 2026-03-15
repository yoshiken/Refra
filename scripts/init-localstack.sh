#!/bin/bash
set -e

ENDPOINT="http://localhost:4566"
BUCKET="refra-dev"

# LocalStack用ダミー認証情報
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1

echo "Waiting for LocalStack..."
until curl -s "$ENDPOINT/_localstack/health" | grep -q '"s3": "running"'; do
  sleep 1
done

echo "Creating S3 bucket: $BUCKET"
aws --endpoint-url="$ENDPOINT" s3 mb "s3://$BUCKET" 2>/dev/null || echo "Bucket already exists"

echo "Setting CORS configuration"
aws --endpoint-url="$ENDPOINT" s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration '{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedOrigins": ["http://localhost:5173"],
      "ExposeHeaders": ["ETag"]
    }
  ]
}'

echo "Initializing index.json"
echo '{"version":1,"updatedAt":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","assets":[],"folders":[]}' | \
  aws --endpoint-url="$ENDPOINT" s3 cp - "s3://$BUCKET/meta/index.json" --content-type application/json

echo "Done! LocalStack S3 is ready."
