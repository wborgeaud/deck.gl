// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

/* global Image, HTMLCanvasElement */
import GL from '@luma.gl/constants';
import {Layer} from '@deck.gl/core';
import {Model, Geometry, Texture2D, fp64, loadTextures} from 'luma.gl';

const {fp64LowPart} = fp64;

import vs from './bitmap-layer-vertex';
import fs from './bitmap-layer-fragment';

const defaultProps = {
  image: null,
  bitmapBounds: {type: 'array', value: [1, 0, 0, 1], compare: true},
  fp64: false,

  desaturate: {type: 'number', min: 0, max: 1, value: 0},
  // More context: because of the blending mode we're using for ground imagery,
  // alpha is not effective when blending the bitmap layers with the base map.
  // Instead we need to manually dim/blend rgb values with a background color.
  transparentColor: {type: 'color', value: [0, 0, 0, 0]},
  tintColor: {type: 'color', value: [255, 255, 255]}
};

/*
 * @class
 * @param {object} props
 * @param {number} props.transparentColor - color to interpret transparency to
 * @param {number} props.tintColor - color bias
 */
export default class BitmapLayer extends Layer {
  getShaders() {
    const projectModule = this.use64bitProjection() ? 'project64' : 'project32';
    return {vs, fs, modules: [projectModule, 'picking']};
  }

  initializeState() {
    const attributeManager = this.getAttributeManager();
    const positions = [1, -1, 0, -1, -1, 0, -1, 1, 0, 1, 1, 0];
    const positions64xyLow = [1, -1, -1, -1, -1, 1, 1, 1];

    attributeManager.add({
      positions: {
        size: 3,
        update: this.calculatePositions,
        value: new Float32Array(positions)
      },
      positions64xyLow: {
        size: 2,
        update: this.calculatePositions64xyLow,
        value: new Float32Array(positions64xyLow)
      }
    });
  }

  updateState({props, oldProps, changeFlags}) {
    // setup model first
    if (props.fp64 !== oldProps.fp64) {
      const {gl} = this.context;
      if (this.state.model) {
        this.state.model.delete();
      }
      this.setState({model: this._getModel(gl)});
      this.getAttributeManager().invalidateAll();
    }

    if (props.image !== oldProps.image) {
      this.loadImage();
    }

    const {model} = this.state;
    const {bitmapBounds, desaturate, transparentColor, tintColor} = props;
    const attributeManager = this.getAttributeManager();

    if (oldProps.bitmapBounds !== bitmapBounds) {
      attributeManager.invalidate('positions');
      attributeManager.invalidate('positions64xyLow');
    }

    if (oldProps.desaturate !== desaturate) {
      model.setUniforms({desaturate});
    }

    if (oldProps.transparentColor !== transparentColor) {
      model.setUniforms({transparentColor});
    }

    if (oldProps.tintColor !== tintColor) {
      model.setUniforms({tintColor});
    }
  }

  _getModel(gl) {
    return new Model(
      gl,
      Object.assign({}, this.getShaders(), {
        id: this.props.id,
        shaderCache: this.context.shaderCache,
        geometry: new Geometry({
          drawMode: GL.TRIANGLE_FAN,
          vertexCount: 4,
          attributes: {
            texCoords: new Float32Array([1, 0, 0, 0, 0, 1, 1, 1])
          }
        }),
        isInstanced: false
      })
    );
  }

  draw({uniforms}) {
    const {bitmapTexture} = this.state;

    // // TODO fix zFighting
    // Render the image
    if (bitmapTexture) {
      this.state.model.render(
        Object.assign({}, uniforms, {
          bitmapTexture
        })
      );
    }
  }

  loadImage() {
    const {gl} = this.context;
    const {image} = this.props;

    if (typeof image === 'string') {
      loadTextures(this.context.gl, {
        urls: [image]
      }).then(([texture]) => {
        this.setState({bitmapTexture: texture});
      });
    } else if (image instanceof Texture2D) {
      this.setState({bitmapTexture: image});
    } else if (
      // browser object
      image instanceof Image ||
      image instanceof HTMLCanvasElement
    ) {
      this.setState({bitmapTexture: new Texture2D(gl, {data: image})});
    }
  }

  calculatePositions(attribute) {
    const {bitmapBounds} = this.props;
    const {value} = attribute;

    // bitmapBounds as [right, bottom, left, top]
    if (Number.isFinite(bitmapBounds[0])) {
      /*
        (l2, t3) ----- (r2, t3)
           |              |
           |              |
           |              |
        (l2, b1) ----- (r0, b1)
     */
      value[0] = bitmapBounds[0];
      value[1] = bitmapBounds[1];
      value[2] = 0;

      value[3] = bitmapBounds[2];
      value[4] = bitmapBounds[1];
      value[5] = 0;

      value[6] = bitmapBounds[2];
      value[7] = bitmapBounds[3];
      value[8] = 0;

      value[9] = bitmapBounds[0];
      value[10] = bitmapBounds[3];
      value[11] = 0;
    } else {
      // [[x, y], ...] or [[x, y, z], ...]
      for (let i = 0; i < bitmapBounds.length; i++) {
        value[i * 3 + 0] = bitmapBounds[i][0];
        value[i * 3 + 1] = bitmapBounds[i][1];
        value[i * 3 + 2] = Number.isFinite(bitmapBounds[i][2]) ? bitmapBounds[i][2] : 0;
      }
    }
  }

  calculatePositions64xyLow(attribute) {
    const isFP64 = this.use64bitPositions();
    attribute.constant = !isFP64;

    if (!isFP64) {
      attribute.value = new Float32Array(4);
      return;
    }

    const {bitmapBounds} = this.props;
    const {value} = attribute;

    // bitmapBounds as [left, bottom, right, top]
    if (Number.isFinite(bitmapBounds[0])) {
      /*
        (l2, t3) ----- (r2, t3)
           |              |
           |              |
           |              |
        (l2, b1) ----- (r0, b1)
     */
      value[0] = fp64LowPart(bitmapBounds[0]);
      value[1] = fp64LowPart(bitmapBounds[1]);

      value[2] = fp64LowPart(bitmapBounds[2]);
      value[3] = fp64LowPart(bitmapBounds[1]);

      value[4] = fp64LowPart(bitmapBounds[2]);
      value[5] = fp64LowPart(bitmapBounds[3]);

      value[6] = fp64LowPart(bitmapBounds[0]);
      value[7] = fp64LowPart(bitmapBounds[3]);
    } else {
      // [[x, y], ...] or [[x, y, z], ...]
      for (let i = 0; i < bitmapBounds.length; i++) {
        value[i * 3 + 0] = fp64LowPart(bitmapBounds[i][0]);
        value[i * 3 + 1] = fp64LowPart(bitmapBounds[i][1]);
      }
    }
  }
}

BitmapLayer.layerName = 'BitmapLayer';
BitmapLayer.defaultProps = defaultProps;
