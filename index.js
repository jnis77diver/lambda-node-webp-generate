"use strict";

const path = require("path");
const AWS = require("aws-sdk");
const Sharp = require("sharp");

const S3 = new AWS.S3({
  signatureVersion: "v4",
});

const QUALITY = 75;
const IMG_EXTS = new Set([".jpg", ".jpeg", ".png"]);
const WEBP_EXT = ".webp";

const fileExtRegex = /^([^\\]*)\.(\w+)$/;

exports.handler = async (event, context, callback) => {
  for (const record of event.Records) {
    const sourceBucket = record["s3"]["bucket"]["name"];
    console.info("BUCKET: " + sourceBucket);
    const key = record["s3"]["object"]["key"];
    // console.info("key: " + key);
    const objectSplit = key.match(fileExtRegex);
    const objectNameSansExt = objectSplit[1];
    const ext = "." + objectSplit[2];
    // console.info("objectNameSansExt: " + objectNameSansExt);
    // console.info("ext: " + ext);

    if (!IMG_EXTS.has(ext) || ext === WEBP_EXT) return;

    console.info("after early return");

    try {
      const bucketResource = await S3.getObject({
        Bucket: sourceBucket,
        Key: key,
      }).promise();
      const sharpImageBuffer = await Sharp(bucketResource.Body)
        .webp({ quality: +QUALITY })
        .toBuffer();

      console.info("after getObject");

      await S3.putObject({
        Body: sharpImageBuffer,
        Bucket: sourceBucket,
        ContentType: "image/webp",
        CacheControl: "max-age=31536000",
        Key: objectNameSansExt + WEBP_EXT,
        StorageClass: "STANDARD",
      }).promise();

      console.log("after putObject");
    } catch (error) {
      console.error(error);
      return { statusCode: 500, body: JSON.stringify({ message: error.message }) };
    }
  }
  return { statusCode: 200 };
};
