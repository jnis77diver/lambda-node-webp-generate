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
const whitespaceRegex = /\s/;

/*
    Lambda function that when invoked (manually or on CRON job) will iterate over S3 bucket and convert 
    all PNG and JPG to WEBP if WEBP not already existing.
*/
exports.handler = async (event, context, callback) => {
  console.info("event: " + JSON.stringify(event));
  let s3Bucket;
  let startAtRandom = null;
  let imgsCreated = 0;
  // "detail" is a property passed from CloudWatch which we'll use for a Cron job and "bucket" prop and value we pass from the CloudWatch event
  try {
    s3Bucket = event["detail"]["bucket"];
    startAtRandom = event["detail"]["startAtRandom"]; // doesn't matter what this value is as long as it's truthy b/c updated below
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

  if (startAtRandom) {
    startAtRandom = Math.floor(Math.random() * 1000) * 1000; // get random number but multiple of 1000 b/c that's what ContinuationToken expects
  }

  console.info("startAtRandom: " + startAtRandom);

  let indexPosition = 0;

  // using for of await loop to iterate over objects in S3 bucket
  for await (const data of listAllKeys(opts, startAtRandom)) {
    // this is a hacky way to iterate to a random position in the data (by thousands)
    // but a better way would be to store the current key in ElasticCache and then access it when the lambda fires for the "startAt" position in options

    if (startAtRandom) {
      indexPosition += data.Contents.length;
      console.info("data.Contents.length: " + data.Contents.length + " || indexPosition: " + indexPosition);
      if (indexPosition < startAtRandom) continue;
    }

    // NOTE: Leaving the console.logs commented out b/c they can be useful for debugging in future
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

      // early return if it's not .png, .jpg, or .jpeg or if it's a .webp file, or in a "folder" we don't care about (i.e. prefixed with a path we want to ignore)
      if (!IMG_EXTENSIONS.has(ext) || ext === WEBP_EXT || PREFIXES_TO_IGNORE.test(key)) continue;

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

        console.info("WebP created for: " + newWebpObj);
        imgsCreated += 1;
        if (imgsCreated % 5 === 0) {
          // if (imgsDeleted % 500 === 0) {
          console.info("WebPs created so far: " + imgsCreated);
        }
      } catch (error) {
        console.error(error);
        // return { statusCode: 500, body: JSON.stringify({ message: error.message }) };
        continue;
      }
    }
  }

  console.info("Finished generating webp images...");
  console.info("Total webp images generated: " + imgsCreated);
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
