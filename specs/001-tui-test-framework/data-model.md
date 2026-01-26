## Data Model

### Test Suite
- **Fields**: `id`, `name`, `tests[]`, `config` (timeouts, parallel, record)
- **Relationships**: has many `Test Case`
- **Validation**: name required; timeouts must be positive integers

### Test Case
- **Fields**: `id`, `name`, `steps[]`, `timeout`, `fixtures`
- **Relationships**: belongs to `Test Suite`; has many `Step`
- **Validation**: name required; steps must be non-empty

### Step
- **Fields**: `id`, `type` (input/wait/assert), `payload`, `timeout`
- **Relationships**: belongs to `Test Case`
- **Validation**: type required; timeout optional but must be positive if set

### Run Result
- **Fields**: `id`, `suiteId`, `caseId`, `status` (pass/fail), `durationMs`, `error`
- **Relationships**: has many `Artifact`
- **Validation**: duration non-negative; status required

### Artifact
- **Fields**: `id`, `runResultId`, `type` (cast/log/snapshot), `path`
- **Relationships**: belongs to `Run Result`
- **Validation**: path required; type required
