"use strict";
const path = require("path");
const AWS = require("aws-sdk");
const Sharp = require("sharp");
const { OPTIONS } = require("./common/common");
const { WEBP_ROOT_FOLDER, QUALITY, IMG_EXTENSIONS, WEBP_EXT, PREFIXES_TO_IGNORE } = OPTIONS;
const S3 = new AWS.S3({
  signatureVersion: "v4",
});

const fileExtRegex = /^([^\\]*)\.(\w+)$/;

// Handler to create a WebP image when another image file is put in the S3 bucket
exports.handler = async (event, context, callback) => {
  for (const record of event.Records) {
    const sourceBucket = record["s3"]["bucket"]["name"];
    console.info("BUCKET: " + sourceBucket);
    const key = record["s3"]["object"]["key"];
    console.info("key: " + key);
    const objectSplit = key.match(fileExtRegex);
    const objectNameSansExt = objectSplit[1];
    const ext = "." + objectSplit[2];

    // early return if it's not .png, .jpg, or .jpeg or if it's a .webp file, or in a "folder" we don't care about (i.e. prefixed with a path we want to ignore)
    if (!IMG_EXTENSIONS.has(ext) || ext === WEBP_EXT || PREFIXES_TO_IGNORE.test(key)) continue;

    try {
      const bucketResource = await S3.getObject({
        Bucket: sourceBucket,
        Key: key,
      }).promise();
      const sharpImageBuffer = await Sharp(bucketResource.Body)
        .webp({ quality: +QUALITY })
        .toBuffer();

      // all webp images will be in a root folder matching the dir structure of rest of the images, only one level down
      // E.g. a .jpg at /static/example.jpg will get an analog webp at /webp/static/example.jpg
      const newWebpObj = WEBP_ROOT_FOLDER + objectNameSansExt + WEBP_EXT;

      await S3.putObject({
        Body: sharpImageBuffer,
        Bucket: sourceBucket,
        ContentType: "image/webp",
        CacheControl: "max-age=31536000",
        Key: newWebpObj,
        StorageClass: "STANDARD",
      }).promise();

      console.info("WebP image created: " + newWebpObj);
    } catch (error) {
      console.error(error);
      return { statusCode: 500, body: JSON.stringify({ message: error.message }) };
    }
  }
  return { statusCode: 200 };
};
