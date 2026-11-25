import QRCode from 'qrcode';

export function qrDataUrl(url) {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 640,
    color: { dark: '#101828', light: '#ffffff' }
  });
}

export function qrSvg(url) {
  return QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, width: 640 });
}
