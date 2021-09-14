# Convert AWS S3 bucket images (jpg, png, jpeg) to WebP using AWS Lambda function

## Lambda Functions Included in Repo

This repo contains four lambda functions which do the following (filename - description).

1. `1_webp-func-cloudfront-origin-response.js` - Generate WebP on the fly using CloudFront Lambda Edge from an existing (jpg, png, or jpeg) when a request for the .webp version happens and the image does not exist yet.
2. `2_generate-webp-s3-trigger.js` - Generate WebP image from jpg, png, or jpeg using a Lambda trigger when image is uploaded to S3 bucket
3. `3_generate-webp-all-bucket-images.js` - Generate all WebP images for an S3 bucket for jpg, png, or jpeg by iterating over the bucket contents and only generating those WebP images that haven't already been generated from their jpg, png, or jpeg counterpart. We can use a CloudWatch Cron job or manually kickoff the process using the `Test` functionality in the lamdba function AWS console.
4. `4_delete-bucket-webp-images.js` - Delete all the WebP images in a bucket. This is a helper lambda for development of the above 3 or just to reset the bucket.

## Usage:

1. Create S3 Bucket (if not already created).
2. Create AWS Lambda function

- Choose Node.js 14.x or higher
- Add a custom role (outside the scope of this repo but should probably have FullAccess to S3 bucket)
- Choose 512 MB RAM (or more) so the lambda function executes in 5 seconds or less and set timeout to 15 mins or max.
- Upload the zip file of this repo to the lambda Code area (see `Appendex 1 - tips for Lambda function zip file creation`)

3. Depending on which Function you are using from `Lambda Functions Included in Repo` above you will do the following:

For #1 - Generate WebP image from S3 bucket trigger

1. Add a Trigger to lambda

- Choose S3 Bucket and then select the bucket you want from dropdown
- For Event Type, select `All object create events`
- Leave Prefix and Suffix as they are
- Save
- To Test, upload an image to the S3 bucket and you should see the .webp version generated after 5 or so seconds. Otherwise, check CloudWatch logs.

For #2 - Generate all WebP images for an S3 bucket by iterating over the bucket

- Create a CloudWatch trigger by selecting Add a Trigger > EventBridge (CloudWatch Events)
- TODO: add info about creating CloudWatch cron job event
- To Test (or to do one-off runs of the `convert_all_in_bucket.js`). See `Appendex 2` for test data to pass as the Event (or select CloudWatch in the AWS Console Lambda Function TEST area which will give you sample event data)

---

### Appendex 1 - tips for Lambda function zip file creation:

1. For Linux distro of the Lambda function, to zip the repo contents without adding the annoying subfolder with same name as the repo folder (which will cause the Lambda func to not work on upload), run the following from the root of the repo to have the zip file created at the same level as the repo (not as a child). Replace `lambda-function` withn name of desired zip file.

```
zip -r ../lambda-function.zip .
```

### Appendix 2 - object structure that is sent from AmazonWatch event.

**NOTE** - the important part below is the "detail" property with "bucket" sub-property. This will be passed from AmazonCloudwatch and the bucket value updated for your specific S3 bucket.

```
{
  "id": "cdc73f9d-aea9-11e3-9d5a-835b769c0d9c",
  "detail-type": "Scheduled Event",
  "source": "aws.events",
  "account": "123456789012",
  "time": "1970-01-01T00:00:00Z",
  "region": "us-east-1",
  "resources": [
    "arn:aws:events:us-east-1:123456789012:rule/ExampleRule"
  ],
  "detail": {"bucket": "morphmarket-media-test"}
}
```
