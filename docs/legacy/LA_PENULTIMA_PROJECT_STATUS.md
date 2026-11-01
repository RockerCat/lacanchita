# La Penúltima

## Project Status

**Status:** Production Ready — Tournament In Progress

**Last Updated:** July 2026

The platform is fully operational for the FIFA World Cup 2026.

---

## Infrastructure

### Hosting

- Vercel

### Database

- Supabase

### Domain

- lapenultima.alexsosa.me

### Authentication

Implemented:

- Email / Password
- Password Recovery
- Password Change
- Invitation Registration

---

## Current Product State

### MVP Status

Complete

The platform currently supports:

- User registration
- Invitation system
- Predictions
- Live match tracking
- Rankings
- Community features
- Classification / bracket tracking
- News feed
- Prize tracking
- PWA install
- Administrative management
- Full FIFA World Cup 2026 support

---

## Completed Features

### Authentication

**Status:** Complete

Implemented:

- Login
- Logout
- Password Recovery
- Password Change
- Invitation-based Registration

---

### Invitation System

**Status:** Complete

Implemented:

- Invitation Code
- Invitation URL
- Invitation Landing Page
- Manual Invitation Code Entry

#### Notes

- Access is invitation-only.
- Users cannot join without a valid invitation.

---

### User Dashboard

**Status:** Complete

Implemented:

- Personal Statistics
- Upcoming Match
- Calendar Navigation
- Ranking Summary
- Prize Pool Summary

---

### Match Calendar

**Status:** Complete

Implemented:

- Date-based grouping
- Accordion layout
- Upcoming date expanded by default

#### Filters

- All
- Pending
- Live
- Finished

#### Decision

Calendar replaced group-based navigation.

This is considered a permanent UX decision.

---

### Match Detail

**Status:** Complete

Implemented:

- Match Information
- Prediction Creation
- Prediction Editing
- Automatic Lock After Kickoff
- Automatic Scheduled → Live Transition (server-side, time-based, no cron required)

---

### Live Matches ("En Vivo")

**Status:** Complete

Implemented:

- Live Match List / Auto-Redirect To Single Live Match
- Score Polling While Live
- Next Upcoming Match Preview

---

### News ("Noticias")

**Status:** Complete

Implemented:

- Auto-Generated Recaps From Results, Standings And Prize Projections
- Deterministic Template Selection (stable content on regeneration)
- Article Detail View

---

### Rankings

**Status:** Complete

Implemented:

- Position
- Points
- Exact Scores
- Correct Winners
- Predictions Count

#### Additional Rules

- Current user is highlighted.
- Disabled users are excluded.

---

### Community

**Status:** Complete

Implemented:

- Community Summary
- Members List
- Ranking Snapshot
- Prize Pool
- Activity Feed

---

### Profile

**Status:** Complete

Implemented:

- User Information
- Statistics
- Password Management

---

### Rules Page

**Status:** Complete

Implemented:

- Scoring Rules
- Knockout Rules
- Prize Rules
- Examples

---

### PWA Install

**Status:** Complete

Implemented:

- Home-Screen Install Banner
- iOS Install Instructions Modal
- Install CTA

#### Notes

- No service-worker caching library (removed after it served stale JS chunks after deploys).

---

## Administration

### Admin Dashboard

**Status:** Complete

Implemented:

- User Metrics
- Match Metrics
- Invitation Metrics
- Quick Actions

---

### User Management

**Status:** Complete

Implemented:

- Enable User
- Disable User
- Generate Password Recovery Link (admin-issued, for users who lose email access)

#### Rules

Disabled users:

- Cannot participate in rankings
- Cannot receive prizes

Accounts remain active for login purposes.

---

### Invitation Tools

**Status:** Complete

Implemented:

- Copy Invitation Link
- Copy Pre-Written Invitation Message (WhatsApp-style, ready to paste)

---

### Match Management

**Status:** Complete

Implemented:

- Calendar View
- Match Status Updates
- Score Updates
- Match Detail View

---

### Prediction Review

**Status:** Complete

Implemented:

- View All Predictions
- Detect Missing Predictions

#### Purpose

Allow administrators to remind users before kickoff.

---

### Advanced Match Editor

**Status:** Complete

Implemented:

- Team Overrides
- Placeholder Overrides
- Fixture Editing
- Match Number Editing
- Venue Editing
- Result Editing
- Advancing Team Override (for knockout draws decided on penalties — does not affect scoring)

#### Purpose

Administrative corrections and knockout management.

---

### Leaderboard Administration

**Status:** Complete

Implemented:

- Recalculate Scores

#### Notes

Recalculation process must remain idempotent.

---

### Classification ("Copa")

**Status:** Complete

Implemented:

- Group Standings
- Qualified Teams
- Best Third Place Teams (assignment matrix)
- Full Knockout Bracket Preview (Round of 32, Round of 16, Quarter Finals, Semi Finals, Third Place, Final)
- Auto-Detected Current Stage Tab

---

### Audit History

**Status:** Complete

Implemented:

- Administrative Activity Log
- Match Change Tracking
- Data Snapshot / Backup Before Risky Changes (knockout transitions, recalculation, migrations)

---

## FIFA World Cup 2026 Support

### Status

Complete

### Implemented

- 104 official matches
- Group Stage
- Round of 32
- Round of 16
- Quarter Finals
- Semi Finals
- Third Place Match
- Final

---

### Knockout Placeholders

Implemented:

- home_placeholder
- away_placeholder
- match_number
- venue

Supported examples:

- Winner Group A
- Runner-up Group B
- Winner Match 73

---

## Major Product Decisions

### Calendar First Navigation

**Status:** Approved

#### Decision

Calendar became the primary navigation model.

#### Reason

Users predict matches more efficiently when browsing by date.

---

### Prediction Privacy

**Status:** Approved

#### Decision

Predictions remain hidden before kickoff.

#### Reason

Prevent copying and preserve competition.

---

### Knockout Evaluation

**Status:** Approved

#### Decision

Penalty shootouts do not affect scoring.

Only:

- Regulation Time
- Extra Time

are used for evaluation.

---

### Prize Display

**Status:** Approved

#### Decision

Display:

"-"

instead of projected winnings before any scored matches exist.

---

### Entry Fee Communication

**Status:** Approved

#### Problem

Users incorrectly interpreted the participation fee as a per-match payment.

#### Solution

Use:

- "Inscripción Única"
- "Pago único para participar durante todo el Mundial"

---

## Current Prize Configuration

### Entry Fee

20.000 COP

### Distribution

#### First Place

70%

#### Second Place

30%

#### Notes

Entry fee and distribution percentages are configurable per group from the admin panel (Prize Configuration). Values above reflect the current live configuration.

The platform does not process payments.

Payments are handled outside the application.

---

## Database State

### Current State

Clean

### Completed

- Match Reset
- Prediction Reset
- Ranking Reset
- Test Data Cleanup

System ready for tournament use.

---

## Known Future Improvements

### Medium Priority

- Improve Activity Feed
- Improve Live Match Experience
- Improve Specific Mobile Layouts

### Low Priority

- Advanced Statistics
- Export Features
- Sharing Features

---

## Operational Guidance

### During The World Cup

Prioritize:

- Stability
- Bug Fixes
- User Support

Avoid:

- Large Database Migrations
- Scoring Changes
- Business Rule Changes
- Major UI Redesigns

The tournament should be operated conservatively once real participants are active.