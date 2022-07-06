import {
  EndpointParameters
} from './types';

export const ENDPOINT_PATH = '/api/endpoint';

export async function postEndpoint(params: EndpointParameters) {
  const req = new Request(ENDPOINT_PATH, {
    method: 'POST',
    body: JSON.stringify(params)
  });

  // TODO do something with the response here?
  const response = await fetch(req);
  const text = await response.text();
  const { result } = JSON.parse(text);
  console.log(result);
};
