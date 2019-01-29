/* global document */
import {Texture2D} from 'luma.gl';
import TinySDF from '@mapbox/tiny-sdf';
import GL from '@luma.gl/constants';

import {buildMapping} from './util';
import Cache from './cache';

function getDefaultCharacterSet() {
  const charSet = [];
  for (let i = 32; i < 128; i++) {
    charSet.push(String.fromCharCode(i));
  }
  return charSet;
}

export const DEFAULT_CHAR_SET = getDefaultCharacterSet();
export const DEFAULT_FONT_FAMILY = 'Monaco, monospace';
export const DEFAULT_FONT_WEIGHT = 'normal';
export const DEFAULT_FONT_SIZE = 64;
export const DEFAULT_BUFFER = 2;
export const DEFAULT_CUTOFF = 0.25;
export const DEFAULT_RADIUS = 3;

const GL_TEXTURE_WRAP_S = 0x2802;
const GL_TEXTURE_WRAP_T = 0x2803;
const GL_CLAMP_TO_EDGE = 0x812f;
const MAX_CANVAS_WIDTH = 1024;

const BASELINE_SCALE = 0.9;
const HEIGHT_SCALE = 1.2;

// only preserve latest three fontAtlas
const CACHE_LIMIT = 3;

/**
 * [key]: {
 *   xOffset, // x position of last character in mapping
 *   yOffset, // y position of last character in mapping
 *   mapping, // x, y coordinate of each character in shared `fontAtlas`
 *   data, // canvas
 *   width. // canvas.width,
 *   height, // canvas.height
 * }
 *
 */
const cache = new Cache(CACHE_LIMIT);

const VALID_PROPS = [
  'fontFamily',
  'fontWeight',
  'characterSet',
  'fontSize',
  'sdf',
  'buffer',
  'cutoff',
  'radius'
];

/**
 * get all the chars not in cache
 * @param key cache key
 * @param characterSet (Array|Set)
 * @returns {Array} chars not in cache
 */
function getNewChars(key, characterSet) {
  const cachedFontAtlas = cache.get(key);
  if (!cachedFontAtlas) {
    return characterSet;
  }

  const newChars = [];
  const cachedMapping = cachedFontAtlas.mapping;
  let cachedCharSet = Object.keys(cachedMapping);
  cachedCharSet = new Set(cachedCharSet);

  let charSet = characterSet;
  if (charSet instanceof Array) {
    charSet = new Set(charSet);
  }

  charSet.forEach(char => {
    if (!cachedCharSet.has(char)) {
      newChars.push(char);
    }
  });

  return newChars;
}

function populateAlphaChannel(alphaChannel, imageData) {
  // populate distance value from tinySDF to image alpha channel
  for (let i = 0; i < alphaChannel.length; i++) {
    imageData.data[4 * i + 3] = alphaChannel[i];
  }
}

function setTextStyle(ctx, fontFamily, fontSize, fontWeight) {
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'baseline';
  ctx.textAlign = 'left';
}

export default class FontAtlasManager {
  constructor(gl) {
    this.gl = gl;
    this.fontFamily = DEFAULT_FONT_FAMILY;
    this.fontWeight = DEFAULT_FONT_WEIGHT;
    this.characterSet = DEFAULT_CHAR_SET;
    this.fontSize = DEFAULT_FONT_SIZE;
    this.buffer = DEFAULT_BUFFER;
    // sdf only props
    // https://github.com/mapbox/tiny-sdf
    this.sdf = false;
    this.cutoff = DEFAULT_CUTOFF;
    this.radius = DEFAULT_RADIUS;

    // key is used for caching generated fontAtlas
    this._key = null;
    this._texture = new Texture2D(this.gl);
  }

  get texture() {
    return this._texture;
  }

  get mapping() {
    const data = cache.get(this._key);
    return data && data.mapping;
  }

  get scale() {
    return HEIGHT_SCALE;
  }

  setProps(props = {}) {
    VALID_PROPS.forEach(prop => {
      if (prop in props) {
        this[prop] = props[prop];
      }
    });

    // update cache key
    const oldKey = this._key;
    this._key = this._getKey();

    const charSet = getNewChars(this._key, this.characterSet);
    const cachedFontAtlas = cache.get(this._key);

    // if a fontAtlas associated with the new settings is cached and
    // there are no new chars
    if (cachedFontAtlas && charSet.length === 0) {
      // update texture with cached fontAtlas
      if (this._key !== oldKey) {
        this._updateTexture(cachedFontAtlas);
      }
      return;
    }

    // update fontAtlas with new settings
    const fontAtlas = this._generateFontAtlas(this._key, charSet, cachedFontAtlas);
    this._updateTexture(fontAtlas);

    // update cache
    cache.set(this._key, fontAtlas);
  }

  _updateTexture({data: canvas, width, height}) {
    // resize texture
    if (this._texture.width !== width || this._texture.height !== height) {
      this._texture.resize({width, height});
    }

    // update image data
    this._texture.setImageData({
      data: canvas,
      width,
      height,
      parameters: {
        [GL_TEXTURE_WRAP_S]: GL_CLAMP_TO_EDGE,
        [GL_TEXTURE_WRAP_T]: GL_CLAMP_TO_EDGE,
        [GL.UNPACK_FLIP_Y_WEBGL]: true
      }
    });

    // this is required step after texture data changed
    this._texture.generateMipmap();
  }

  _generateFontAtlas(key, characterSet, cachedFontAtlas) {
    const {fontFamily, fontWeight, fontSize, buffer, sdf, radius, cutoff} = this;
    const oldCanvas = cachedFontAtlas && cachedFontAtlas.data;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    setTextStyle(ctx, fontFamily, fontSize, fontWeight);

    // 1. build mapping
    const {mapping, canvasHeight, xOffset, yOffset} = buildMapping(
      Object.assign(
        {
          getFontWidth: char => ctx.measureText(char).width,
          fontHeight: fontSize * HEIGHT_SCALE,
          buffer,
          characterSet,
          maxCanvasWidth: MAX_CANVAS_WIDTH
        },
        cachedFontAtlas && {
          mapping: cachedFontAtlas.mapping,
          xOffset: cachedFontAtlas.xOffset,
          yOffset: cachedFontAtlas.yOffset
        }
      )
    );

    // 2. update canvas
    canvas.width = MAX_CANVAS_WIDTH;
    canvas.height = canvasHeight;
    setTextStyle(ctx, fontFamily, fontSize, fontWeight);

    // copy old canvas to new canvas
    if (oldCanvas) {
      ctx.drawImage(oldCanvas, 0, 0, oldCanvas.width, oldCanvas.height);
    }

    // 3. layout characters
    if (sdf) {
      const tinySDF = new TinySDF(fontSize, buffer, radius, cutoff, fontFamily, fontWeight);
      // used to store distance values from tinySDF
      // tinySDF.size equals `fontSize + buffer * 2`
      const imageData = ctx.getImageData(0, 0, tinySDF.size, tinySDF.size);

      for (const char of characterSet) {
        populateAlphaChannel(tinySDF.draw(char), imageData);
        ctx.putImageData(imageData, mapping[char].x - buffer, mapping[char].y - buffer);
      }
    } else {
      for (const char of characterSet) {
        ctx.fillText(char, mapping[char].x, mapping[char].y + fontSize * BASELINE_SCALE);
      }
    }

    return {
      xOffset,
      yOffset,
      mapping,
      data: canvas,
      width: canvas.width,
      height: canvas.height
    };
  }

  _getKey() {
    const {fontFamily, fontWeight, fontSize, buffer, sdf, radius, cutoff} = this;
    if (sdf) {
      return `${fontFamily} ${fontWeight} ${fontSize} ${buffer} ${radius} ${cutoff}`;
    }
    return `${fontFamily} ${fontWeight} ${fontSize} ${buffer}`;
  }
}
