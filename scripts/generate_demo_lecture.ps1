param(
    [string]$OutputDirectory = "data/demo/synthetic-lecture-en"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$targetRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputDirectory))
$dataRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "data"))
if (-not $targetRoot.StartsWith($dataRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "OutputDirectory must resolve inside the repository data directory."
}

$transcriptSource = Join-Path $repoRoot "evaluation/data/transcripts/synthetic-en-transactions.json"
$ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source
$ffprobe = (Get-Command ffprobe -ErrorAction Stop).Source

New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null
$partsDirectory = Join-Path $targetRoot "audio-parts"
New-Item -ItemType Directory -Force -Path $partsDirectory | Out-Null
$source = Get-Content -LiteralPath $transcriptSource -Raw -Encoding utf8 | ConvertFrom-Json
$synthesizer = New-Object -ComObject SAPI.SpVoice
$synthesizer.Rate = -1
$synthesizer.Volume = 100

$concatLines = [System.Collections.Generic.List[string]]::new()
$generatedSegments = [System.Collections.Generic.List[object]]::new()
$cursor = 0.0
foreach ($segment in $source.segments) {
        $partPath = Join-Path $partsDirectory ("segment-{0:D2}.wav" -f [int]$segment.index)
        $stream = New-Object -ComObject SAPI.SpFileStream
        $stream.Open($partPath, 3, $false)
        $synthesizer.AudioOutputStream = $stream
        $null = $synthesizer.Speak([string]$segment.text)
        $stream.Close()
        $durationText = & $ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $partPath
        if ($LASTEXITCODE -ne 0) { throw "ffprobe failed for $partPath" }
        $duration = [double]::Parse($durationText.Trim(), [System.Globalization.CultureInfo]::InvariantCulture)
        $segmentStart = [math]::Round($cursor, 2)
        $cursor += $duration
        $segmentEnd = [math]::Round($cursor, 2)
        $generatedSegments.Add([ordered]@{
            index = [int]$segment.index
            start = $segmentStart
            end = $segmentEnd
            text = [string]$segment.text
        })
        $escaped = $partPath.Replace("'", "''").Replace("\", "/")
        $concatLines.Add("file '$escaped'")
}

$concatPath = Join-Path $targetRoot "audio-concat.txt"
[System.IO.File]::WriteAllLines($concatPath, $concatLines, [System.Text.UTF8Encoding]::new($false))
$audioPath = Join-Path $targetRoot "lecture.wav"
& $ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i $concatPath -c copy $audioPath
if ($LASTEXITCODE -ne 0) { throw "ffmpeg audio concatenation failed." }

$videoPath = Join-Path $targetRoot "lecturebridge-demo.mp4"
& $ffmpeg -hide_banner -loglevel error -y -f lavfi -i "color=c=0x0f172a:s=1280x720:r=30" -i $audioPath -shortest -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 160k $videoPath
if ($LASTEXITCODE -ne 0) { throw "ffmpeg video generation failed." }

$transcriptOutput = [ordered]@{
    video_id = "synthetic-lecture-en-demo"
    language = "en"
    source_language = "en"
    provenance = "Project-authored script with local Windows TTS; public LectureBridge demo use permitted."
    segments = $generatedSegments
}
$transcriptPath = Join-Path $targetRoot "transcript.json"
$transcriptJson = $transcriptOutput | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($transcriptPath, $transcriptJson + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))

$provenance = [ordered]@{
    asset = "lecturebridge-demo.mp4"
    script_source = "evaluation/data/transcripts/synthetic-en-transactions.json"
    rights = "Project-authored synthetic educational script; reusable for LectureBridge public demo."
    voice = "Local Windows SAPI installed voice"
    generated_with = "Windows SAPI plus FFmpeg"
    third_party_lecture_media = $false
    contains_personal_data = $false
    duration_seconds = [math]::Round($cursor, 2)
}
$provenancePath = Join-Path $targetRoot "provenance.json"
[System.IO.File]::WriteAllText($provenancePath, ($provenance | ConvertTo-Json -Depth 4) + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))

Write-Output "demo_video=$videoPath"
Write-Output "demo_transcript=$transcriptPath"
Write-Output "duration_seconds=$([math]::Round($cursor, 2))"
