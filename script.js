// // Get references to HTML elements
// const verifyButton = document.getElementById('verify-button');
// const textInput = document.getElementById('text-input');
// const resultsContainer = document.getElementById('results-container');
// const loader = document.getElementById('loader');

// // Listen for click on Verify button
// verifyButton.addEventListener('click', async () => {
//   const query = textInput.value.trim();
//   if (query.length < 5) {
//     alert("Please enter a longer question or valid URL.");
//     return;
//   }

//   verifyButton.disabled = true;
//   verifyButton.innerText = "Verifying...";
//   loader.classList.remove('hidden');
//   resultsContainer.innerHTML = '';

//   try {
//     const response = await fetch('http://localhost:3000/verify', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ query: query }),
//     });

//     const data = await response.json();

//     if (data.error) {
//       resultsContainer.innerText = data.error;
//       return;
//     }

//     // Format output: bold, newlines, short "Visit site" links
//     const formattedHtml = data.result
//       .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
//       .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">Visit site</a>')
//       .replace(/\n/g, '<br>');

//     resultsContainer.innerHTML = formattedHtml;

//   } catch (error) {
//     console.error("Error:", error);
//     resultsContainer.innerText = "❌ Something went wrong. Please try again.";
//   } finally {
//     // ✅ Reset button and loader so you can query multiple times
//     loader.classList.add('hidden');
//     verifyButton.disabled = false;
//     verifyButton.innerText = "Verify";
//   }
// });
