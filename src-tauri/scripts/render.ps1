param([Parameter(Mandatory=$true)][string]$InputFile, [Parameter(Mandatory=$true)][string]$OutputFile)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$data = Get-Content -Raw -LiteralPath $InputFile -Encoding UTF8 | ConvertFrom-Json
$segment = Join-Path (Split-Path -Parent $OutputFile) 'segment.wav'
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$format = New-Object -TypeName System.Speech.AudioFormat.SpeechAudioFormatInfo -ArgumentList @(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$validVoices = @($synth.GetInstalledVoices() | Where-Object Enabled | ForEach-Object { $_.VoiceInfo.Name })
$pcm = New-Object System.IO.MemoryStream
$parts = @($data.lines)
foreach ($item in $parts) {
    $text = [string]$item.text
    # Empty text is intentional for actor rehearsal: add silence, not speech.
    if ($text.Length -gt 10000) { $text = $text.Substring(0, 10000) }
    if ($null -ne $data.pronunciation) {
        foreach ($property in $data.pronunciation.PSObject.Properties) {
            $from = [string]$property.Name; $to = [string]$property.Value
            if ($from.Length -gt 0 -and $from.Length -le 120 -and $to.Length -le 120) {
                $text = [regex]::Replace($text, '(?<!\p{L})' + [regex]::Escape($from) + '(?!\p{L})', [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $to }, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            }
        }
    }
    $speaker = [string]$item.speaker
    $voiceName = ''
    if ($null -ne $data.voices) { $entry = $data.voices.PSObject.Properties[$speaker]; if ($null -ne $entry) { $voiceName = [string]$entry.Value } }
    if ($voiceName -and ($validVoices -contains $voiceName)) { $synth.SelectVoice($voiceName) }
    else { try { $synth.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::NotSet) } catch {} }
    $synth.Rate = [int][math]::Max(-5,[math]::Min(5,([double]$data.speed - 1.0)*6))
    if ($text.Trim()) {
    $synth.SetOutputToWaveFile($segment, $format)
    try { $synth.Speak($text) } finally { $synth.SetOutputToNull() }
    $wave = [System.IO.File]::ReadAllBytes($segment)
    $start = -1; $size = 0
    for($pos = 12; $pos -le $wave.Length-8; ) {
        $chunk = [System.Text.Encoding]::ASCII.GetString($wave,$pos,4)
        $length = [BitConverter]::ToUInt32($wave,$pos+4)
        if ($chunk -eq 'data') { $start = $pos + 8; $size = [int]$length; break }
        $pos += 8 + [int]$length + ([int]$length % 2)
    }
    if ($start -lt 0 -or $start + $size -gt $wave.Length) { throw 'Formato de audio SAPI inesperado' }
    $pcm.Write($wave,$start,$size)
    }
    $pauseMs = [int][math]::Max(0,[math]::Min(25000,[double]$item.pause))
    $silence = [byte[]]::new([int]($pauseMs*16*2))
    $pcm.Write($silence,0,$silence.Length)
    if($pcm.Length -gt 240000000){throw 'La narración supera el tamaño admitido'}
}
$writer = New-Object System.IO.BinaryWriter([System.IO.File]::Create($OutputFile))
try {
  $length = [int]$pcm.Length
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes('RIFF'));$writer.Write([int](36+$length))
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes('WAVEfmt '));$writer.Write([int]16)
  $writer.Write([int16]1);$writer.Write([int16]1);$writer.Write([int]16000);$writer.Write([int]32000)
  $writer.Write([int16]2);$writer.Write([int16]16)
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes('data'));$writer.Write([int]$length)
  $pcm.WriteTo($writer.BaseStream)
} finally {$writer.Dispose();$pcm.Dispose();$synth.Dispose(); Remove-Item -LiteralPath $segment -Force -ErrorAction SilentlyContinue}
