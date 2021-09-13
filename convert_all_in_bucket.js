"use strict";

const path = require("path");
const AWS = require("aws-sdk");
const Sharp = require("sharp");
const WEBP_ROOT_FOLDER = "webp/";

const S3 = new AWS.S3({
  signatureVersion: "v4",
});

const QUALITY = 75;
const IMG_EXTS = new Set([".jpg", ".jpeg", ".png"]);
const WEBP_EXT = ".webp";

const fileExtRegex = /^([^\\]*)\.(\w+)$/;
const whitespaceRegex = /\s/;
/*
    Lambda function that when invoked (manually or on CRON job) will iterate over S3 bucket and convert 
    all PNG and JPG to WEBP if WEBP not already existing.
*/
exports.handler = async (event, context, callback) => {
  console.info("event: " + JSON.stringify(event));
  let s3Bucket;
  // "detail" is a property passed from CloudWatch which we'll use for a Cron job and "bucket" prop and value we pass from the CloudWatch event
  try {
    s3Bucket = event["detail"]["bucket"];
    if (!s3Bucket) throw true;
  } catch (err) {
    throw 'Bucket was not passed in event["detail"]["bucket"]';
  }

  // including all options that can be passed to listObjectsV2 in case needed in future
  const opts = {
    Bucket: s3Bucket /* required */,
    // ContinuationToken: 'STRING_VALUE',
    // Delimiter: 'STRING_VALUE',
    // EncodingType: url,
    // FetchOwner: true || false,
    // MaxKeys: 'NUMBER_VALUE',
    // Prefix: 'STRING_VALUE',
    // RequestPayer: requester,
    // StartAfter: 'STRING_VALUE'
  };

  // using for of await loop to iterate over objects in S3 bucket
  for await (const data of listAllKeys(opts)) {
    // console.log(data.Contents);
    // console.info("data.Contents: " + JSON.stringify(data.Contents));

    // better to use a full-on for loop b/c of the try/catch and continue
    for (var i = 0, len = data.Contents.length; i < len; i++) {
      const record = data.Contents[i];
      // Key property

      const key = record.Key;
      console.info("key: " + key);
      const keySplit = key.match(fileExtRegex);

      // if it's not a file or has whitespace, continue to next iteration
      if (!keySplit || whitespaceRegex.test(key)) continue;

      const filenameSansExt = keySplit[1];
      const ext = "." + keySplit[2];
      // console.info("objectNameSansExt: " + objectNameSansExt);
      // console.info("ext: " + ext);

      // early return if it's not .png, .jpg, or .jpeg or if it's a .webp file
      if (!IMG_EXTS.has(ext) || ext === WEBP_EXT) continue;

      // all webp images will be in a root folder matching the dir structure of rest of the images, only one level down
      // E.g. a .jpg at /static/example.jpg will get an analog webp at /webp/static/example.jpg
      const newWebpObj = WEBP_ROOT_FOLDER + filenameSansExt + WEBP_EXT;

      const paramsForWebPVersion = {
        Bucket: opts.Bucket,
        Key: newWebpObj, //if any sub folder-> path/of/the/folder.ext
      };

      // Check if a .webp version already exists and if so, continue to next iteration. Otherwise, create WebP
      try {
        await S3.headObject(paramsForWebPVersion).promise();
        //console.log("WebP File Found in S3");
        continue;
      } catch (err) {
        // TODO remove
        console.log("WebP File not Found so continue to create WebP || ERROR : " + err);
      }

      try {
        // check if we already have a .webp version of this image

        const bucketResource = await S3.getObject({
          Bucket: opts.Bucket,
          Key: key,
        }).promise();
        const sharpImageBuffer = await Sharp(bucketResource.Body)
          .webp({ quality: +QUALITY })
          .toBuffer();

        await S3.putObject({
          Body: sharpImageBuffer,
          Bucket: opts.Bucket,
          ContentType: "image/webp",
          CacheControl: "max-age=31536000",
          Key: newWebpObj,
          StorageClass: "STANDARD",
        }).promise();

        console.log("WebP created for: " + filenameSansExt + WEBP_EXT);
      } catch (error) {
        console.error(error);
        // return { statusCode: 500, body: JSON.stringify({ message: error.message }) };
        continue;
      }
    }
  }

  console.info("Finished generating webp images...");
  return { statusCode: 200 };
};

async function* listAllKeys(opts) {
  opts = { ...opts };
  do {
    const data = await S3.listObjectsV2(opts).promise();
    opts.ContinuationToken = data.NextContinuationToken;
    yield data;
  } while (opts.ContinuationToken);
}
