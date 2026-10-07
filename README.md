# Placement Management System (Core)

## Stack

- **Backend:** Node.js (22.5+) + Express + PostgreSQL
- **Frontend:** React (Vite) + React Router
- **Auth:** JWT, bcrypt password hashing


## Running it

**Backend** (port 4000):
```
cd backend
npm install
node server.js
```

**Frontend** (port 5173):
```
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Register an admin account and a student
account, then:
1. As admin: create a drive with eligibility rules (min CGPA, backlog
   limits, allowed branches/genders).
2. As student: fill in your profile (CGPA, backlogs, branch, gender) on
   the Profile page, then check the Drives page — you'll see a green
   "Eligible" or red "Not eligible" tag with the exact reasons.
3. Apply. The server re-validates eligibility itself — a student can't
   apply to a drive they don't qualify for even by calling the API
   directly.
4. As admin: open the drive's applicant list, update statuses
   (Shortlisted / Selected / Rejected), or export the list as CSV.
