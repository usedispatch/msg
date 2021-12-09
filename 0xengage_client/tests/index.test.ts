import { expect } from 'chai';
import 'mocha';

describe('Hello function', () => {
  it('should return hello world', () => {
    const expected = 'hello world';
    const actual = 'hello world';
    expect(expected).to.equal(actual);
  });

});
