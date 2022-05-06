import * as zlib from 'zlib';

export const compress = async (input: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    zlib.brotliCompress(input, {}, (error, result) => {
      if (!error) resolve(result);
      else reject(error);
    });
  });
};

export const decompress = async (input: Buffer): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    zlib.brotliDecompress(input, {}, (error, result) => {
      if (!error) resolve(result);
      else reject(error);
    });
  });
};
