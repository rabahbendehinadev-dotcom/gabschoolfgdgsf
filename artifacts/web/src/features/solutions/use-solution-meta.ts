import { useEffect } from "react";

/** Only public teaser text belongs in discovery metadata. Restore the host page on exit. */
export function useSolutionMeta(title: string, description: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} | GAB ONLINE`;
    const records = [
      ["name", "description", description],
      ["property", "og:title", document.title],
      ["property", "og:description", description],
      ["property", "og:type", "website"],
    ].map(([attribute, key, value]) => {
      const existing = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
      const node = existing || document.createElement("meta");
      const previous = node.getAttribute("content");
      node.setAttribute(attribute, key);
      node.setAttribute("content", value);
      if (!existing) document.head.appendChild(node);
      return { node, existing, previous };
    });
    return () => {
      document.title = previousTitle;
      records.forEach(({ node, existing, previous }) => {
        if (!existing) node.remove();
        else if (previous === null) node.removeAttribute("content");
        else node.setAttribute("content", previous);
      });
    };
  }, [title, description]);
}