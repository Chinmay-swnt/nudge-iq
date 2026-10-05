import 'package:flutter/material.dart';
import '../config/constants.dart';
import 'home/my_tasks_screen.dart';
import 'meetings/meetings_screen.dart';
import 'profile/profile_screen.dart';

class MainNavigation extends StatefulWidget {
  const MainNavigation({super.key});

  @override
  State<MainNavigation> createState() => _MainNavigationState();
}

class _MainNavigationState extends State<MainNavigation> {
  int _currentIndex = 0;

  final List<Widget> _screens = const [
    MyTasksScreen(),
    MeetingsScreen(),
    ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: AppConstants.surface,
          border: Border(
            top: BorderSide(color: AppConstants.border, width: 1),
          ),
        ),
        child: NavigationBar(
          selectedIndex: _currentIndex,
          onDestinationSelected: (index) => setState(() => _currentIndex = index),
          backgroundColor: AppConstants.surface,
          elevation: 0,
          indicatorColor: AppConstants.primary.withValues(alpha: 0.15),
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.check_circle_outline),
              selectedIcon: Icon(Icons.check_circle, color: AppConstants.primary),
              label: 'My Tasks',
            ),
            NavigationDestination(
              icon: Icon(Icons.calendar_month_outlined),
              selectedIcon: Icon(Icons.calendar_month, color: AppConstants.primary),
              label: 'Meetings',
            ),
            NavigationDestination(
              icon: Icon(Icons.person_outline),
              selectedIcon: Icon(Icons.person, color: AppConstants.primary),
              label: 'Profile',
            ),
          ],
        ),
      ),
    );
  }
}
