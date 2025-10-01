import { describe, expect, it } from 'vitest';
import {
  attr,
  attrParam,
  black,
  blue,
  bold,
  code,
  color,
  cyan,
  emoji,
  EMOTES,
  font,
  gray,
  green,
  italic,
  link,
  magenta,
  parseLinks,
  red,
  sanitize,
  size,
  underline,
  white,
  yellow,
} from './chat';

describe('EMOTES', () => {
  it('should be an array of strings', () => {
    expect(Array.isArray(EMOTES)).toBe(true);
    expect(EMOTES.length).toBeGreaterThan(0);
    expect(EMOTES.every(emote => typeof emote === 'string')).toBe(true);
  });

  it('should contain expected emotes', () => {
    expect(EMOTES).toContain('brick');
    expect(EMOTES).toContain('pog');
    expect(EMOTES).toContain('egg');
  });
});

describe('sanitize', () => {
  it('should escape special characters', () => {
    expect(sanitize('a\\b')).toBe('a\\\\b');
    expect(sanitize('a;b')).toBe('a&scl;b');
    expect(sanitize('a>b')).toBe('a&gt;b');
    expect(sanitize('a_b')).toBe('a&und;b');
    expect(sanitize('a<b')).toBe('a&lt;b');
    expect(sanitize('a"b')).toBe('a\\"b');
  });

  it('should convert emotes to emoji tags', () => {
    expect(sanitize(':brick:')).toBe('<emoji>brick</>');
    expect(sanitize('Hello :brick: world')).toBe('Hello <emoji>brick</> world');
  });

  it('should not convert unknown emotes', () => {
    expect(sanitize(':notanemote:')).toBe(':notanemote:');
  });

  it('should handle multiple substitutions', () => {
    expect(sanitize('Hello :brick: <world> "test";')).toBe(
      'Hello <emoji>brick</> &lt;world&gt; \\"test\\"&scl;',
    );
  });
});

describe('parseLinks', () => {
  it('should convert URLs to link tags', () => {
    expect(parseLinks('Check https://example.com')).toBe(
      'Check <link="https://example.com">https://example.com</>',
    );
    expect(
      parseLinks('Multiple https://example.com and http://test.org links'),
    ).toBe(
      'Multiple <link="https://example.com">https://example.com</> and <link="http://test.org">http://test.org</> links',
    );
  });

  it('should handle URLs with special characters', () => {
    expect(parseLinks('https://example.com/path?query=1&param=2')).toBe(
      '<link="https://example.com/path?query=1&param=2">https://example.com/path?query=1&param=2</>',
    );
  });

  it('should not convert text that is not a URL', () => {
    expect(parseLinks('Just plain text')).toBe('Just plain text');
    expect(parseLinks('Invalid url: http:/example')).toBe(
      'Invalid url: http:/example',
    );
  });
});

describe('attr and attrParam', () => {
  it('attr should create a tag with optional parameter', () => {
    const testAttr = attr('test');
    expect(testAttr('hello')).toBe('<test>hello</>');

    const testAttrWithParam = attr('test', 'param');
    expect(testAttrWithParam('hello')).toBe('<test="param">hello</>');
  });

  it('attrParam should create a tag with a required parameter', () => {
    const testParam = attrParam('test');
    expect(testParam('hello', 'param')).toBe('<test="param">hello</>');
  });

  it('attrParam should work with number parameters', () => {
    const testNumParam = attrParam<number>('test');
    expect(testNumParam('hello', 42)).toBe('<test="42">hello</>');
  });
});

describe('tag helper functions', () => {
  it('bold should wrap content in bold tags', () => {
    expect(bold('hello')).toBe('<b>hello</>');
  });

  it('italic should wrap content in italic tags', () => {
    expect(italic('hello')).toBe('<i>hello</>');
  });

  it('underline should wrap content in underline tags', () => {
    expect(underline('hello')).toBe('<u>hello</>');
  });

  it('emoji should wrap content in emoji tags', () => {
    expect(emoji('brick')).toBe('<emoji>brick</>');
  });

  it('code should wrap content in code tags', () => {
    expect(code('console.log("hello")')).toBe('<code>console.log("hello")</>');
  });

  it('font should wrap content in font tags with specified font', () => {
    expect(font('hello', 'Arial')).toBe('<font="Arial">hello</>');
  });

  it('size should wrap content in size tags with specified size', () => {
    expect(size('hello', 24)).toBe('<size="24">hello</>');
  });

  it('link should wrap content in link tags with specified URL', () => {
    expect(link('Click here', 'https://example.com')).toBe(
      '<link="https://example.com">Click here</>',
    );
  });
});

describe('color helper functions', () => {
  it('color should wrap content in color tags with specified color', () => {
    expect(color('hello', 'f00')).toBe('<color="f00">hello</>');
  });

  it('red should wrap content in red color tags', () => {
    expect(red('hello')).toBe('<color="f00">hello</>');
  });

  it('green should wrap content in green color tags', () => {
    expect(green('hello')).toBe('<color="0f0">hello</>');
  });

  it('blue should wrap content in blue color tags', () => {
    expect(blue('hello')).toBe('<color="00f">hello</>');
  });

  it('yellow should wrap content in yellow color tags', () => {
    expect(yellow('hello')).toBe('<color="ff0">hello</>');
  });

  it('cyan should wrap content in cyan color tags', () => {
    expect(cyan('hello')).toBe('<color="0ff">hello</>');
  });

  it('magenta should wrap content in magenta color tags', () => {
    expect(magenta('hello')).toBe('<color="f0f">hello</>');
  });

  it('black should wrap content in black color tags', () => {
    expect(black('hello')).toBe('<color="000">hello</>');
  });

  it('white should wrap content in white color tags', () => {
    expect(white('hello')).toBe('<color="fff">hello</>');
  });

  it('gray should wrap content in gray color tags', () => {
    expect(gray('hello')).toBe('<color="888">hello</>');
  });
});

describe('nested tags', () => {
  it('should support nesting multiple formatting tags', () => {
    expect(bold(red('important'))).toBe('<b><color="f00">important</></>');
    expect(italic(underline('emphasized'))).toBe('<i><u>emphasized</></>');
    expect(blue(bold('highlighted'))).toBe('<color="00f"><b>highlighted</></>');
  });

  it('should support complex nested structures', () => {
    const nestedText = red(bold(underline('critical') + ' alert'));
    expect(nestedText).toBe('<color="f00"><b><u>critical</> alert</></>');
  });

  it('should handle nested tags with parameters', () => {
    const nestedWithParams = size(color('important message', 'f00'), 24);
    expect(nestedWithParams).toBe(
      '<size="24"><color="f00">important message</></>',
    );
  });

  it('should support multiple levels of nesting', () => {
    const deeplyNested = red(bold(italic(underline('very important'))));
    expect(deeplyNested).toBe(
      '<color="f00"><b><i><u>very important</></></></>',
    );
  });

  it('should support nesting with emoji and other special tags', () => {
    const emojiWithFormat = bold(emoji('brick') + ' awesome');
    expect(emojiWithFormat).toBe('<b><emoji>brick</> awesome</>');

    const linkWithFormat = color(
      link('Visit site', 'https://example.com'),
      '0f0',
    );
    expect(linkWithFormat).toBe(
      '<color="0f0"><link="https://example.com">Visit site</></>',
    );
  });
});
