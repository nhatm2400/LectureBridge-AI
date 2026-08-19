# Demo data

The demo generator uses the project-authored synthetic English transactions transcript. It contains no person, private lecture, third-party recording, or PII.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate_demo_lecture.ps1
```

Runtime outputs are written to ignored `data/demo/synthetic-lecture-en/`, including `lecturebridge-demo.mp4`, `transcript.json`, and `provenance.json`. Generated media is local demo output and must not be committed.
