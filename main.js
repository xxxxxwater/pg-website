const revealItems = document.querySelectorAll(".reveal");

const reveal = (entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("is-visible");
    }
  });
};

const observer = new IntersectionObserver(reveal, {
  threshold: 0.2,
});

revealItems.forEach((item) => observer.observe(item));
