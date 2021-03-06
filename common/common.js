const OPTIONS = {
  WEBP_ROOT_FOLDER: "webp/",
  QUALITY: 75, // image quality for WebP conversion
  IMG_EXTENSIONS: new Set([".jpg", ".jpeg", ".png"]),
  WEBP_EXT: ".webp",
  PREFIXES_TO_IGNORE: new RegExp("^(media/raw_images|webp/media/raw_images)", "i"), // to add to this, just add more | with parens
};

module.exports = {
  OPTIONS: OPTIONS,
};
