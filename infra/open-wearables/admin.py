"""Run inside the private Open Wearables container to provision Aevum credentials."""
import getpass
import json
import urllib.parse
import urllib.request


def request(path, payload, token=None, form=False):
    headers = {'Content-Type': 'application/x-www-form-urlencoded' if form else 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    data = urllib.parse.urlencode(payload).encode() if form else json.dumps(payload).encode()
    req = urllib.request.Request('http://127.0.0.1:8000/api/v1' + path, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


if __name__ == '__main__':
    email = input('Open Wearables admin email: ')
    password = getpass.getpass('Admin password: ')
    token = request('/auth/login', {'username': email, 'password': password}, form=True)['access_token']
    key = request('/developer/api-keys', {'name': 'Aevum server'}, token)
    app = request('/applications', {'name': 'Aevum mobile companion'}, token)
    print('Store these values in Aevum API Railway variables; do not commit them:')
    print('OPEN_WEARABLES_API_KEY=' + key['key'])
    print('OPEN_WEARABLES_APP_ID=' + app['app_id'])
    print('OPEN_WEARABLES_APP_SECRET=' + app['app_secret'])
