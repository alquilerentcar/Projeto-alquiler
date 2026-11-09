// Quem chega de uma locação volta para a página dessa locação.
(()=>{const id=new URLSearchParams(location.search).get('locacao'),back=document.querySelector('.topbar a[href="locacoes.html"],.topbar a[href="contratos.html"]');if(!id||!back)return;back.href='locacao-painel.html?locacao='+encodeURIComponent(id);back.textContent='← Voltar à locação';})();
