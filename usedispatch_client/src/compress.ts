// import * as zlib from 'zlib';

// export const compress = async (input: string): Promise<Buffer> => {
//   return new Promise((resolve, reject) => {
//     console.log('zlib library:', zlib);
//     console.log('zlib constants -> ', zlib.constants);
//     zlib.brotliCompress(input, {params: {
//       [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
//     }}, (error, result) => {
//       if (!error) resolve(result);
//       else reject(error);
//     });
//   });
// };

// export const decompress = async (input: Buffer): Promise<Buffer> => {
//   return new Promise((resolve, reject) => {
//     zlib.brotliDecompress(input, {}, (error, result) => {
//       if (!error) resolve(result);
//       else reject(error);
//     });
//   });
// };
