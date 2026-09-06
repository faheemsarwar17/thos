"""S3 Storage Adapter."""

import boto3
from botocore.exceptions import ClientError
from app.core.config import get_settings
import logging

logger = logging.getLogger("thos.storage")

def get_s3_client():
    settings = get_settings()
    if not settings.s3_endpoint or not settings.s3_access_key:
        return None
        
    return boto3.client(
        's3',
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key.get_secret_value() if settings.s3_secret_key else "",
        region_name=settings.s3_region
    )

def generate_presigned_url(object_name: str, content_type: str = "video/webm", expiration: int = 3600) -> str | None:
    """Generate a presigned URL to share an S3 object."""
    settings = get_settings()
    s3_client = get_s3_client()
    if not s3_client:
        logger.error("S3 client not configured")
        return None

    try:
        response = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': settings.s3_bucket_name,
                'Key': object_name,
                'ContentType': content_type
            },
            ExpiresIn=expiration
        )
    except ClientError as e:
        logger.error("Failed to generate presigned URL: %s", e)
        return None

    return response

def upload_file_to_s3(file_path: str, object_name: str) -> bool:
    """Upload a file to an S3 bucket."""
    settings = get_settings()
    s3_client = get_s3_client()
    if not s3_client:
        logger.error("S3 client not configured")
        return False

    try:
        s3_client.upload_file(file_path, settings.s3_bucket_name, object_name)
    except ClientError as e:
        logger.error("Failed to upload file to S3: %s", e)
        return False
    return True
