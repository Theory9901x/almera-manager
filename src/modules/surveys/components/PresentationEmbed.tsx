import { ExternalLink, Presentation } from 'lucide-react'

// Embebe la presentacion de apoyo de una pagina antes de sus preguntas. Los PDF los renderiza el
// propio navegador via <iframe> nativo; PPT/PPTX se delegan al Office Online Viewer de Microsoft,
// que necesita poder alcanzar la URL desde internet — por eso la URL se arma absoluta con el
// origen actual (funciona en el dominio publico; en localhost el visor de Office no podra
// alcanzarla, de ahi el enlace "Abrir en una pestaña nueva" como respaldo siempre visible).
export function PresentationEmbed({ url, name }: { url: string; name?: string | null }) {
  const absoluteUrl = `${window.location.origin}${url}`
  const isPdf = /\.pdf($|\?)/i.test(url)
  const embedSrc = isPdf ? absoluteUrl : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteUrl)}`

  return (
    <div className="survey-presentation-embed">
      <div className="survey-presentation-embed-bar">
        <span><Presentation size={14} /> {name || 'Presentación de apoyo'}</span>
        <a href={absoluteUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Abrir en una pestaña nueva</a>
      </div>
      <div className="survey-presentation-embed-frame">
        <iframe src={embedSrc} title={name || 'Presentación de apoyo'} allowFullScreen />
      </div>
    </div>
  )
}
