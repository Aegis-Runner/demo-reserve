# Atlas Reservations

A fictional demo application used as an AegisRunner testing target (no third-party IP).

## What it exercises

```
ATLAS RESERVATIONS — room bookings with a TIME-SLOT CONFLICT invariant.
  INVARIANT   no two confirmed bookings share the same room AND slot. Booking a
              taken slot must be rejected.
  PERSISTENCE a new booking (free-text party name) must survive an independent
              re-read and carries a visible app-issued reference (BKG-###).
  FILTER      "Today" is a SUBSET (bookings on the selected day); a leak is unsound.
Faults (healthy when DEMO_BUGS empty):
  doublebook    a conflicting booking is accepted (two on one room+slot)
  ghostbooking  the booking confirms but never persists
  leakytoday    the Today filter also shows other days
```

## Run

```sh
docker build -t demo-reserve .
docker run -p 3000:3000 -e DEMO_RESET_TOKEN=changeme demo-reserve
```

Fault injection is env-gated via `DEMO_BUGS` (comma-separated); healthy when empty. Reset via `POST /api/reset` with header `X-Reset-Token`.
