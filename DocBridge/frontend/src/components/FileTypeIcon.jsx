import { FileImage, FileVideo, FileAudio, File } from 'lucide-react'

export default function FileTypeIcon({ type, className = 'w-4 h-4' }) {
  if (type === 'image') return <FileImage className={className} />
  if (type === 'video') return <FileVideo className={className} />
  if (type === 'audio') return <FileAudio className={className} />
  return <File className={className} />
}
