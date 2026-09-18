import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:open_wearables_health_sdk/open_wearables_health_sdk.dart';
import 'package:open_wearables_health_sdk/health_data_type.dart';

void main() => runApp(const MaterialApp(home: Companion()));

class Companion extends StatefulWidget {
  const Companion({super.key});
  @override
  State<Companion> createState() => _CompanionState();
}

class _CompanionState extends State<Companion> {
  final origin = const String.fromEnvironment('AEVUM_URL');
  final email = TextEditingController();
  final password = TextEditingController();
  String message = 'Sign in to your Aevum account. Grant health and wearable consent in Aevum first.';
  bool busy = false;

  Future<void> connect() async {
    setState(() { busy = true; });
    try {
      final uri = Uri.parse(origin);
      if (uri.scheme != 'https' || uri.host.isEmpty || uri.userInfo.isNotEmpty || uri.path.isNotEmpty && uri.path != '/') {
        throw Exception('Build this app with your AEVUM_URL HTTPS origin.');
      }
      final headers = {'Content-Type': 'application/json', 'X-Aevum-Request': '1'};
      final login = await http.post(Uri.parse('$origin/api/auth/login'), headers: headers,
          body: jsonEncode({'email': email.text.trim(), 'password': password.text})).timeout(const Duration(seconds: 30));
      password.clear();
      if (login.statusCode != 200) throw Exception('Sign-in failed. Check your email and password.');
      final cookie = login.headers['set-cookie']?.split(';').first;
      if (cookie == null) throw Exception('No authenticated session was returned.');
      final response = await http.post(Uri.parse('$origin/api/wearables/mobile/session'),
          headers: {...headers, 'Cookie': cookie}, body: '{}').timeout(const Duration(seconds: 30));
      if (response.statusCode != 200) throw Exception('Connection unavailable. Check health and wearable consent in Aevum, or contact support.');
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      await OpenWearablesHealthSdk.configure(host: data['host'] as String);
      await OpenWearablesHealthSdk.stopBackgroundSync();
      await OpenWearablesHealthSdk.signOut();
      await OpenWearablesHealthSdk.signIn(userId: data['user_id'] as String,
          accessToken: data['access_token'] as String, refreshToken: data['refresh_token'] as String);
      if (Platform.isAndroid) {
        final available = await OpenWearablesHealthSdk.getAvailableProviders();
        if (available.isEmpty) throw Exception('Install Health Connect or Samsung Health first.');
        if (!mounted) return;
        final selected = await showDialog<AndroidHealthProvider>(context: context,
          builder: (context) => SimpleDialog(title: const Text('Choose health data source'), children: [
            for (final item in available) if (item.provider != null)
              SimpleDialogOption(onPressed: () => Navigator.pop(context, item.provider), child: Text(item.displayName)),
          ]));
        if (selected == null) throw Exception('Health connection cancelled.');
        await OpenWearablesHealthSdk.setProvider(selected);
      }
      await OpenWearablesHealthSdk.requestAuthorization(types: [
        HealthDataType.steps, HealthDataType.restingHeartRate, HealthDataType.sleep,
      ]);
      final started = await OpenWearablesHealthSdk.startBackgroundSync(syncDaysBack: 30);
      if (!started) throw Exception('Sync did not start. Check health permissions on your device.');
      if (mounted) setState(() { message = 'Sync started. Available measurements will appear for review in Aevum. Access to every health type is not guaranteed by the operating system.'; });
    } catch (e) {
      if (mounted) setState(() { message = e.toString(); });
    } finally {
      if (mounted) setState(() { busy = false; });
    }
  }

  Future<void> stop() async {
    try {
      await OpenWearablesHealthSdk.stopBackgroundSync();
      await OpenWearablesHealthSdk.signOut();
      if (mounted) setState(() { message = 'Device sync stopped. You can also disconnect or revoke wearable consent in Aevum.'; });
    } catch (_) { if (mounted) setState(() { message = 'Could not stop sync. Revoke permissions in your phone’s health settings.'; }); }
  }

  @override
  void dispose() { email.dispose(); password.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Aevum · Health connection')),
    body: SingleChildScrollView(padding: const EdgeInsets.all(24), child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [Text(message), const SizedBox(height: 24),
        TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Aevum email')),
        TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
        const SizedBox(height: 24),
        FilledButton(onPressed: busy ? null : connect, child: Text(busy ? 'Connecting…' : 'Connect health data')),
        TextButton(onPressed: busy ? null : stop, child: const Text('Stop device sync')),
      ],
    )),
  );
}
