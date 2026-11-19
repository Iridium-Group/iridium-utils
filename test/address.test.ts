import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatIPv6,
  ipVersion,
  isIPv4,
  isIPv6,
  isInCidr,
  isLoopbackAddress,
  isPrivateAddress,
  isPrivateIPv4,
  isPrivateIPv6,
  normalizeAddress,
  parseCidr,
  parseIPv4,
  parseIPv6,
} from '../src/address.ts';

describe('parseIPv4', () => {
  it('parses dotted quads', () => {
    assert.deepEqual(parseIPv4('192.168.1.20'), [192, 168, 1, 20]);
    assert.deepEqual(parseIPv4('0.0.0.0'), [0, 0, 0, 0]);
  });
  it('rejects malformed, shorthand and octal-looking input', () => {
    for (const bad of ['1.2.3', '1.2.3.4.5', '256.1.1.1', '01.2.3.4', 'a.b.c.d', '', '1..2.3']) {
      assert.equal(parseIPv4(bad), null, bad);
    }
    for (const bad of ['0x7f.0.0.1', '2130706433', '127.1', ' 1.2.3.4']) {
      assert.equal(parseIPv4(bad), null, bad);
    }
  });
});

describe('parseIPv6', () => {
  it('expands compressed forms, brackets and zone ids', () => {
    assert.deepEqual(parseIPv6('::1'), [0, 0, 0, 0, 0, 0, 0, 1]);
    assert.deepEqual(parseIPv6('fe80::1%eth0'), [0xfe80, 0, 0, 0, 0, 0, 0, 1]);
    assert.deepEqual(parseIPv6('[2001:db8::]'), [0x2001, 0xdb8, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(parseIPv6('::'), [0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('handles IPv4 tails', () => {
    assert.deepEqual(parseIPv6('::ffff:127.0.0.1'), [0, 0, 0, 0, 0, 0xffff, 0x7f00, 0x0001]);
    assert.deepEqual(parseIPv6('64:ff9b::10.0.0.1'), [0x64, 0xff9b, 0, 0, 0, 0, 0x0a00, 0x0001]);
    assert.deepEqual(parseIPv6('1:2:3:4:5:6:1.2.3.4'), [1, 2, 3, 4, 5, 6, 0x0102, 0x0304]);
  });
  it('rejects malformed input', () => {
    for (const bad of ['1:2:3', ':::', '1::2::3', 'g::1', '12345::', '1:2:3:4:5:6:7:8:9', 'x']) {
      assert.equal(parseIPv6(bad), null, bad);
    }
  });
});

describe('isPrivateIPv4', () => {
  it('blocks every special-purpose IPv4 range', () => {
    const cases = [
      '0.0.0.0',
      '0.255.255.255',
      '10.0.0.1',
      '10.255.255.255',
      '100.64.0.1',
      '100.127.255.254',
      '127.0.0.1',
      '127.255.255.254',
      '169.254.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '172.31.255.255',
      '192.0.0.8',
      '192.0.2.10',
      '192.88.99.1',
      '192.168.0.1',
      '198.18.0.1',
      '198.19.255.255',
      '198.51.100.7',
      '203.0.113.9',
      '224.0.0.1',
      '239.255.255.250',
      '240.0.0.1',
      '255.255.255.255',
    ];
    for (const ip of cases) assert.equal(isPrivateIPv4(ip), true, ip);
  });
  it('allows public addresses next to the range boundaries', () => {
    const cases = [
      '1.1.1.1',
      '8.8.8.8',
      '93.184.215.14',
      '100.63.255.255',
      '100.128.0.0',
      '172.15.255.255',
      '172.32.0.0',
      '169.253.255.255',
      '192.169.0.1',
      '198.17.255.255',
      '198.20.0.0',
      '223.255.255.255',
    ];
    for (const ip of cases) assert.equal(isPrivateIPv4(ip), false, ip);
  });
  it('returns false for non-IPv4 input', () => {
    assert.equal(isPrivateIPv4('::1'), false);
    assert.equal(isPrivateIPv4('example.com'), false);
  });
});

describe('isPrivateIPv6', () => {
  it('blocks every special-purpose IPv6 range', () => {
    const cases = [
      '::',
      '::1',
      '::ffff:8.8.8.8',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::127.0.0.1',
      '::ffff:0:10.0.0.1',
      '64:ff9b::127.0.0.1',
      '64:ff9b::a9fe:a9fe',
      '64:ff9b:1::1',
      '100::1',
      '2001::1',
      '2001:db8::1',
      '2002:7f00:1::',
      '2002:c0a8:101::1',
      '3fff::1',
      'fc00::1',
      'fd00:ec2::254',
      'fdff:ffff::1',
      'fe80::1',
      'febf::1',
      'fec0::1',
      'ff02::1',
      '[::1]',
      'fe80::1%lo0',
    ];
    for (const ip of cases) assert.equal(isPrivateIPv6(ip), true, ip);
  });
  it('allows public addresses, including NAT64 and 6to4 to public IPv4', () => {
    const cases = [
      '2606:4700:4700::1111',
      '2001:4860:4860::8888',
      '64:ff9b::808:808',
      '2002:808:808::1',
      '2a00:1450:4001::1',
    ];
    for (const ip of cases) assert.equal(isPrivateIPv6(ip), false, ip);
  });
  it('returns false for non-IPv6 input', () => {
    assert.equal(isPrivateIPv6('127.0.0.1'), false);
  });
});

describe('isPrivateAddress', () => {
  it('dispatches by family', () => {
    assert.equal(isPrivateAddress('10.1.2.3'), true);
    assert.equal(isPrivateAddress('fe80::1'), true);
    assert.equal(isPrivateAddress('1.1.1.1'), false);
    assert.equal(isPrivateAddress('2606:4700::1'), false);
  });
  it('fails closed on invalid input', () => {
    assert.equal(isPrivateAddress('example.com'), true);
    assert.equal(isPrivateAddress(''), true);
    assert.equal(isPrivateAddress('999.1.1.1'), true);
  });
  it('reports the IP version', () => {
    assert.equal(ipVersion('1.2.3.4'), 4);
    assert.equal(ipVersion('[::1]'), 6);
    assert.equal(ipVersion('localhost'), 0);
    assert.equal(isIPv4('1.2.3.4'), true);
    assert.equal(isIPv6('1.2.3.4'), false);
    assert.equal(isIPv6('::'), true);
  });
});

describe('formatIPv6 and normalizeAddress', () => {
  it('formats in RFC 5952 canonical form', () => {
    assert.equal(formatIPv6([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]), '2001:db8::1');
    assert.equal(formatIPv6([0, 0, 0, 0, 0, 0, 0, 0]), '::');
    assert.equal(formatIPv6([1, 0, 0, 2, 0, 0, 0, 3]), '1:0:0:2::3');
    assert.equal(formatIPv6([1, 0, 2, 3, 4, 5, 6, 7]), '1:0:2:3:4:5:6:7');
    assert.equal(formatIPv6([0xfe80, 0, 0, 0, 0, 0, 0, 0]), 'fe80::');
  });
  it('rejects invalid groups', () => {
    assert.throws(() => formatIPv6([1, 2, 3]), RangeError);
    assert.throws(() => formatIPv6([0x10000, 0, 0, 0, 0, 0, 0, 0]), RangeError);
  });
  it('normalizes either family and returns null otherwise', () => {
    assert.equal(normalizeAddress('[2001:0DB8:0000::0001]'), '2001:db8::1');
    assert.equal(normalizeAddress('fe80::1%eth0'), 'fe80::1');
    assert.equal(normalizeAddress(' 10.0.0.1 '), '10.0.0.1');
    assert.equal(normalizeAddress('example.com'), null);
  });
});

describe('isLoopbackAddress', () => {
  it('matches IPv4, IPv6 and IPv4-mapped loopback only', () => {
    assert.equal(isLoopbackAddress('127.0.0.1'), true);
    assert.equal(isLoopbackAddress('127.8.9.10'), true);
    assert.equal(isLoopbackAddress('::1'), true);
    assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
    assert.equal(isLoopbackAddress('10.0.0.1'), false);
    assert.equal(isLoopbackAddress('::2'), false);
    assert.equal(isLoopbackAddress('localhost'), false);
  });
});

describe('CIDR', () => {
  it('parses prefixes and single addresses', () => {
    assert.deepEqual(parseCidr('10.0.0.0/8'), { version: 4, bytes: [10, 0, 0, 0], prefix: 8 });
    assert.equal(parseCidr('1.2.3.4')?.prefix, 32);
    assert.equal(parseCidr('fc00::/7')?.version, 6);
    assert.equal(parseCidr('::1')?.prefix, 128);
    for (const bad of ['10.0.0.0/33', '::/129', '10.0.0.0/-1', '10.0.0.0/', 'host/8']) {
      assert.equal(parseCidr(bad), null, bad);
    }
  });
  it('matches IPv4 ranges', () => {
    assert.equal(isInCidr('172.20.1.1', '172.16.0.0/12'), true);
    assert.equal(isInCidr('172.32.0.1', '172.16.0.0/12'), false);
    assert.equal(isInCidr('8.8.8.8', '0.0.0.0/0'), true);
    assert.equal(isInCidr('1.2.3.4', '1.2.3.4'), true);
    assert.equal(isInCidr('1.2.3.5', '1.2.3.4'), false);
  });
  it('matches IPv6 ranges and never crosses families', () => {
    assert.equal(isInCidr('fd12::1', 'fc00::/7'), true);
    assert.equal(isInCidr('fe80::1', 'fc00::/7'), false);
    assert.equal(isInCidr('2001:db8:1::1', '2001:db8::/32'), true);
    assert.equal(isInCidr('10.0.0.1', '::/0'), false);
    assert.equal(isInCidr('::1', '0.0.0.0/0'), false);
    assert.equal(isInCidr('1.2.3.4', 'not a cidr'), false);
  });
});
