# Trace fixtures for the Adoption Register

Files here are published at `raw.githubusercontent.com` so that the register's trace check (design/ADOPT.md §3) can be tested
end to end against an outside host, on the test database only. Each file carries the SHA-256 of a test statement, or the
address of a test record; none is an adoption.

From the register's revision v6d (28 Oct 2026, after its security review) a trace is a secret token given once to the
submitter, found in the page itself: the `v6d-*.txt` files carry the lines given for test records on the test database.
The earlier files (record address or SHA-256) no longer trace anything.
