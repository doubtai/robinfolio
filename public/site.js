const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const reveals=[...document.querySelectorAll('.reveal')];

if(reducedMotion||!('IntersectionObserver' in window)){
  reveals.forEach(element=>element.classList.add('is-visible'));
}else{
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  },{threshold:.12,rootMargin:'0px 0px -7%'});
  reveals.forEach(element=>observer.observe(element));

  const layers=[...document.querySelectorAll('.hero-art,.opportunity-art,.advisor-art')];
  let scheduled=false;
  const updateParallax=()=>{
    scheduled=false;
    layers.forEach(layer=>{
      const rect=layer.parentElement.getBoundingClientRect();
      if(rect.bottom<0||rect.top>innerHeight)return;
      const offset=(rect.top+rect.height/2-innerHeight/2)*-.025;
      layer.style.transform=`scale(1.035) translate3d(0,${offset}px,0)`;
    });
  };
  addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(updateParallax)}},{passive:true});
  updateParallax();
}

