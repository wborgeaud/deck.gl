import LightingEffect from './lighting-effect';

export default class EffectPreparator {
  constructor(props) {}

  prepareEffects({effects, layers}) {
    const lightSources = this.prepareLightingEffects(effects);
    return {
      lightSources
    };
  }

  prepareLightingEffects(effects) {
    let lightEffect;
    if (effects && Array.isArray(effects)) {
      lightEffect = effects.find(effect => effect instanceof LightingEffect);
    }

    const lightSources = {
      ambientLight: null,
      pointLights: [],
      directionalLights: []
    };

    if (lightEffect && lightEffect.ambientLight) {
      lightSources.ambientLight = lightEffect.ambientLight;
    }

    if (lightEffect && lightEffect.pointLights) {
      lightSources.pointLights = lightEffect.pointLights;
    }

    if (lightEffect && lightEffect.directionalLights) {
      lightSources.directionalLights = lightEffect.directionalLights;
    }
    return lightSources;
  }
}
