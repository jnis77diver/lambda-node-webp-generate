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
const whitespaceRegex = /\s/;
/*
    Lambda function that when invoked (manually or on CRON job) will iterate over S3 bucket and convert 
    all PNG and JPG to WEBP if WEBP not already existing.
*/
exports.handler = async (event, context, callback) => {
  console.info("event: " + JSON.stringify(event));
  let s3Bucket;
  let imgsDeleted = 0;
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

      // early return if it's not a .webp file
      if (ext.toLowerCase() !== WEBP_EXT) continue;

      // if needed to check whether file exists or not, check this S.O. https://stackoverflow.com/a/53530749
      // but we don't need to here b/c we listed objects

      try {
        const params = {
          Bucket: s3Bucket,
          Key: key, //if any sub folder-> path/of/the/folder.ext
        };
        await S3.deleteObject(params).promise();
        // console.log("file deleted Successfully");
        imgsDeleted += 1;
        if (imgsDeleted % 500 === 0) {
          console.info("WebPs deleted so far: " + imgsDeleted);
        }
      } catch (err) {
        console.error("ERROR in file Deleting:");
        console.error(err);
      }
    }
  }

  console.info("Finished deleting webp images...");
  console.info("Total webp images deleted: " + imgsDeleted);

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
