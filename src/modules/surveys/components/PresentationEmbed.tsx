import { ExternalLink, Presentation } from 'lucide-react'
import { PdfSlideViewer } from './PdfSlideViewer'

// Embebe la presentacion de apoyo de una pagina antes de sus preguntas. Los PDF se renderizan con
// un visor propio (PdfSlideViewer, via PDF.js) para mostrar solo la diapositiva grande igual en
// cualquier navegador — el visor nativo de cada navegador trae su propia barra/miniaturas que no
// siempre se puede ocultar. PPT/PPTX (sin convertir) se delegan al Office Online Viewer de
// Microsoft, que necesita poder alcanzar la URL desde internet — por eso se arma absoluta con el
// origen actual (funciona en el dominio publico; en localhost no la alcanza, de ahi el enlace
// "Abrir en una pestaña nueva" como respaldo siempre visible).
export function PresentationEmbed({ url, name }: { url: string; name?: string | null }) {
  const absoluteUrl = `${window.location.origin}${url}`
  const isPdf = /\.pdf($|\?)/i.test(url)

  return (
    <div className="survey-presentation-embed">
      <div className="survey-presentation-embed-bar">
        <span><Presentation size={14} /> {name || 'Presentación de apoyo'}</span>
        <a href={absoluteUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Abrir en una pestaña nueva</a>
      </div>
      <div className="survey-presentation-embed-frame">
        {isPdf ? (
          <PdfSlideViewer url={absoluteUrl} />
        ) : (
          <iframe src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteUrl)}`} title={name || 'Presentación de apoyo'} allowFullScreen />
        )}
      </div>
    </div>
  )
}
