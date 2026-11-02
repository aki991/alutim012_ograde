import dekor from './photos/dekor-01.jpg';
import dekorThumb from './photos/dekor-01-thumb.jpg';
import h1 from './photos/horizontal-01.jpg';
import h1Thumb from './photos/horizontal-01-thumb.jpg';
import h2 from './photos/horizontal-02.jpg';
import h2Thumb from './photos/horizontal-02-thumb.jpg';
import kapija from './photos/kapija-lamele.jpg';
import kapijaThumb from './photos/kapija-lamele-thumb.jpg';
import panel from './photos/panel-01.jpg';
import panelThumb from './photos/panel-01-thumb.jpg';
import staklo from './photos/staklo-01.jpg';
import stakloThumb from './photos/staklo-01-thumb.jpg';

export const PHOTOS: Record<string, { full: string; thumb: string }> = {
  'horizontal-01': { full: h1, thumb: h1Thumb },
  'horizontal-02': { full: h2, thumb: h2Thumb },
  'panel-01': { full: panel, thumb: panelThumb },
  'dekor-01': { full: dekor, thumb: dekorThumb },
  'staklo-01': { full: staklo, thumb: stakloThumb },
  'kapija-lamele': { full: kapija, thumb: kapijaThumb },
};
