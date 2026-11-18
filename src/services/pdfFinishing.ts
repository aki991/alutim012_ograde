import { FINISHING_NOTE, finishingArea, finishingMass, finishingMissing, type FinishingSummary } from '../domain/pricing/finishing';

/** Zajednički završni zbir za oba proizvodna dokumenta. */
export function pdfFinishing(value: FinishingSummary) {
  return [
    {
      unbreakable: true,
      margin: [0, 14, 0, 0],
      stack: [
        { text: 'Materijal za plastifikaciju', fontSize: 12, bold: true, margin: [0, 0, 0, 6] },
        { table: { widths: ['*', '*'], body: [[
          { fillColor: '#f6f4f3', margin: [8, 6, 8, 6], stack: [{ text: 'Površina za plastificiranje', fontSize: 9, color: '#64748b' }, { text: finishingArea(value), fontSize: 17, bold: true }] },
          { fillColor: '#f6f4f3', margin: [8, 6, 8, 6], stack: [{ text: 'Ukupna masa materijala', fontSize: 9, color: '#64748b' }, { text: finishingMass(value), fontSize: 17, bold: true }] },
        ]] }, layout: 'noBorders' },
        { text: FINISHING_NOTE, fontSize: 8, color: '#64748b', margin: [0, 5, 0, 0] },
        { text: 'Masa elemenata je bez zajedničkih stubova. Stubovi su uključeni jednom u ovaj zbir. Površina za plastificiranje ne uključuje inox, beton i polimere.', fontSize: 8, color: '#64748b', margin: [0, 2, 0, 0] },
      ],
    },
    ...finishingMissing(value).map((text) => ({ text, fontSize: 8, color: '#b42318', margin: [0, 4, 0, 0] })),
  ];
}
