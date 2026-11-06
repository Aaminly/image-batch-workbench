"""Start the local workbench, optionally on a private LAN address."""
import argparse
from ipaddress import IPv4Address, IPv4Network
import os
import socket


def configuration(lan=False, address=None):
    if not lan:
        return '127.0.0.1', '127.0.0.1'
    if address is None:
        # UDP connect selects the default interface without sending a packet.
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(('192.0.2.1', 9))
            address = probe.getsockname()[0]
    ip = IPv4Address(address)
    if not any(ip in IPv4Network(network) for network in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')):
        raise ValueError('局域网模式需要本机的私有 IPv4 地址')
    return '0.0.0.0', str(ip)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lan', action='store_true', help='允许可信局域网访问')
    args = parser.parse_args()
    try:
        host, address = configuration(args.lan)
        if args.lan:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
                probe.bind((address, 0))
    except (ValueError, OSError) as error:
        parser.exit(1, f'无法启动：{error}\n')
    os.environ.pop('STUDIO_LAN_IP', None)
    if args.lan:
        os.environ['STUDIO_LAN_IP'] = address
        print('局域网模式：可连接设备均可读写草稿；请仅在可信网络使用。', flush=True)
    print(f'工作台地址：http://{address}:8765', flush=True)
    import uvicorn
    uvicorn.run('server:app', host=host, port=8765)


if __name__ == '__main__':
    main()
