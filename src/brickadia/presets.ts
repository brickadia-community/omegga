import { BRColor, BRVector } from './types';

export type Preset<T extends string, D> = {
  formatVersion?: '1';
  presetVersion?: '1';
  type?: T;
  data?: D;
};

export type EnvironmentPreset = Preset<
  'Environment',
  {
    groups?: {
      Sky?: {
        timeOfDay?: number;
        timeChangeSpeed?: number;
        sunAngle?: number;
        sunScale?: number;
        sunHorizonScaleMultiplier?: number;
        sunlightColor?: BRColor;
        skyIntensity?: number;
        skyColor?: BRColor;
        moonScale?: number;
        moonlightIntensity?: number;
        moonlightColor?: BRColor;
        starsIntensity?: number;
        starsColor?: BRColor;
        auroraIntensity?: number;
        weatherIntensity?: BRColor;
        rainSnow?: number;
        cloudCoverage?: number;
        cloudSpeedMultiplier?: number;
        precipitationParticleAmount?: number;
        bCloseLightning?: boolean;
        rainVolume?: number;
        closeThunderVolume?: number;
        distantThunderVolume?: number;
        windVolume?: number;
        clearFogDensity?: number;
        cloudyFogDensity?: number;
        clearFogHeightFalloff?: number;
        cloudyFogHeightFalloff?: number;
        fogColor?: BRColor;
      };
      GroundPlate?: {
        variance?: number;
        varianceBrickSize?: number;
        groundColor?: BRColor;
        groundAccentColor?: BRColor;
        isVisible?: boolean;
        bUseStudTexture?: boolean;
      };
      Water?: {
        waterHeight?: number;
        waterAbsorption?: BRVector;
        waterScattering?: BRVector;
        waterFogIntensity?: number;
        waterFogAmbientColor?: BRColor;
        waterFogAmbientScale?: number;
        waterFogScatteringColor?: BRColor;
        waterFogScatteringScale?: number;
      };
      Ambience?: {
        selectedAmbienceTypeInt?: number;
        ambienceVolume?: number;
        reverbEffect?: string;
      };
    };
  }
>;
